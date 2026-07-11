// EdgeOne Pages / Makers 边缘函数 — 多供应商大模型代理（隐藏 API Key）
// 路由: /api/proxy  （由 edge-functions/api/proxy.js 自动映射）
// 部署: EdgeOne Pages 项目 或 EdgeOne Makers（直接上传整个 edge-functions/ 目录）
//
// 环境变量（在 EdgeOne 控制台「环境变量」中设置）:
//   ALLOWED_REFERER  = mei-junhao.github.io        # 逗号分隔的多个允许来源，防盗刷；留空则放行所有来源
//   DEEPSEEK_API_KEY = sk-xxx                       # 第1层
//   KKDMX_KEY_PRO    = sk-xxx                       # 第2层
//   KKDMX_KEY_FLASH  = sk-xxx                       # 第3层
//   KKDMX_KEY_MINIMAX= sk-xxx                       # 第4层
//   AGNES_KEY        = sk-xxx                       # 第5层

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// 兼容多种 env 取法：context.env 优先，部分运行版本提供全局 ENV
function getEnv(context) {
  const e = (context && context.env) || {};
  if (Object.keys(e).length) return e;
  if (typeof globalThis !== 'undefined' && globalThis.ENV) return globalThis.ENV;
  return e;
}

// 沿用前端 master-chat.html 中 TIERS 的顺序与模型
function buildTiers(env) {
  return [
    { name: 'DeepSeek V4 Flash', api: 'https://api.deepseek.com/v1/chat/completions',    key: env.DEEPSEEK_API_KEY,  model: 'deepseek-v4-flash' },
    { name: 'DeepSeek Pro',       api: 'https://api.kkdmx.com/v1/chat/completions',       key: env.KKDMX_KEY_PRO,     model: 'deepseek-ai/deepseek-v4-pro' },
    { name: 'DeepSeek Flash',     api: 'https://api.kkdmx.com/v1/chat/completions',       key: env.KKDMX_KEY_FLASH,  model: 'deepseek-ai/deepseek-v4-flash' },
    { name: 'MiniMax M3',         api: 'https://api.kkdmx.com/v1/chat/completions',       key: env.KKDMX_KEY_MINIMAX, model: 'minimaxai/minimax-m3' },
    { name: 'Agnes',              api: 'https://apihub.agnes-ai.com/v1/chat/completions', key: env.AGNES_KEY,        model: 'agnes-2.0-flash' },
  ];
}

// 解析允许的 Referer 列表（逗号/空格分隔）；自动包含本函数自身域名（同源）
function allowedReferers(env, request) {
  const raw = (env.ALLOWED_REFERER || 'mei-junhao.github.io').toLowerCase();
  const list = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  try {
    const host = new URL(request.url).host.toLowerCase();
    if (host) list.push(host);           // 同源放行（如 chattest-s7wlh4rd.edgeone.cool 自身）
  } catch (e) {}
  return list;
}

export function onRequestOptions(context) {
  const origin = context.request.headers.get('origin') || '*';
  return new Response(null, { headers: corsHeaders(origin) });
}

// GET /api/proxy/health 健康检查 + 配置自诊（不泄露 Key 值，只报"是否配置"）
export function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!url.pathname.endsWith('/health')) {
    return new Response('Method not allowed', { status: 405 });
  }
  const env = getEnv(context);
  const tiers = buildTiers(env);
  const diag = {
    ok: true,
    functionHost: url.host,
    allowedReferers: allowedReferers(env, context.request),
    providers: tiers.map(t => ({ name: t.name, hasKey: !!t.key })),
    allKeysMissing: tiers.every(t => !t.key),
  };
  return new Response(JSON.stringify(diag, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequestPost(context) {
  const { request } = context;
  const env = getEnv(context);

  // 1) 防盗刷：Referer / Origin 白名单（留空 ALLOWED_REFERER 则放行全部，便于排查）
  const allowed = allowedReferers(env, request);
  const referer = (request.headers.get('referer') || request.headers.get('origin') || '').toLowerCase();
  const origin  = request.headers.get('origin') || '*';
  if (env.ALLOWED_REFERER && env.ALLOWED_REFERER.trim() !== '' && referer) {
    const pass = allowed.some(a => referer.includes(a));
    if (!pass) {
      return json({ error: 'Forbidden: invalid referer', got: referer, allowed }, 403);
    }
  }

  // 2) 解析请求体（前端只需传 messages / temperature / max_tokens）
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  body.stream = true;
  // 上游多数需要显式 max_tokens，缺失时给一个合理默认，避免被拒
  if (!body.max_tokens || body.max_tokens <= 0) body.max_tokens = 2048;

  // 3) 逐层回退
  const tiers = buildTiers(env);
  let lastError = null;
  const skipped = [];
  for (const t of tiers) {
    if (!t.key) { skipped.push(t.name); continue; }   // 缺密钥的层跳过
    body.model = t.model;                              // 每层使用自己的模型
    try {
      const upstream = await fetch(t.api, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + t.key,
        },
        body: JSON.stringify(body),
      });
      if (!upstream.ok) {
        lastError = `${t.name} -> HTTP ${upstream.status}`;
        continue;                                       // 该层失败，试下一层
      }
      // 成功拿到 200，直接把流透传回去（保住打字机效果）
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Upstream-Tier': t.name,
        },
      });
    } catch (e) {
      lastError = `${t.name} -> ${e.message}`;
    }
  }
  return json({
    error: 'All providers failed',
    detail: lastError,
    skippedLayersWithoutKey: skipped,
    hint: skipped.length === tiers.length ? '所有 Key 均未配置或 context.env 取不到变量，请在 EdgeOne 控制台确认环境变量名与拼写' : '部分 Key 缺失，已跳过；如仍失败请检查其余 Key 有效性',
  }, 502);
}
