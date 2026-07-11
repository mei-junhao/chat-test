// EdgeOne 边缘函数 — 单供应商(DeepSeek)大模型代理，隐藏 API Key
// 路由: /api/proxy  （由 edge-functions/api/proxy.js 自动映射）
// 部署: 把整个仓库部署到 EdgeOne Pages/Makers，函数自动挂在 /api/proxy
//
// 环境变量（在 EdgeOne 控制台「环境变量」中设置）:
//   ALLOWED_REFERER  = （可选）逗号分隔的允许来源，防盗刷；留空则仅用同源白名单
//   DEEPSEEK_API_KEY = sk-xxx   ← 唯一需要的 Key

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // 默认模型；若你的 Key 支持其他模型(如 deepseek-reasoner)，可在前端「自定义模式」填写

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

// 解析允许的 Referer 列表（逗号/空格分隔）；自动包含本函数自身域名（同源）
function allowedReferers(env, request) {
  const raw = (env.ALLOWED_REFERER || '').toLowerCase();
  const list = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  try {
    const host = new URL(request.url).host.toLowerCase();
    if (host) list.push(host); // 同源放行（如 chattest-s7wlh4rd.edgeone.cool 自身）
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
  const diag = {
    ok: true,
    functionHost: url.host,
    allowedReferers: allowedReferers(env, context.request),
    deepseekConfigured: !!env.DEEPSEEK_API_KEY,
  };
  return new Response(JSON.stringify(diag, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequestPost(context) {
  const { request } = context;
  const env = getEnv(context);

  // 1) 防盗刷：Referer / Origin 白名单（同源自动放行；ALLOWED_REFERER 留空则仅依赖同源）
  const allowed = allowedReferers(env, request);
  const referer = (request.headers.get('referer') || request.headers.get('origin') || '').toLowerCase();
  if (env.ALLOWED_REFERER && env.ALLOWED_REFERER.trim() !== '' && referer) {
    const pass = allowed.some(a => referer.includes(a));
    if (!pass) {
      return json({ error: 'Forbidden: invalid referer', got: referer, allowed }, 403);
    }
  }

  // 2) 解析请求体（前端只需传 messages / temperature / max_tokens / 可选 model）
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  body.stream = true;
  // 上游需要显式 max_tokens，缺失时给合理默认
  if (!body.max_tokens || body.max_tokens <= 0) body.max_tokens = 2048;
  // 模型：前端自定义模式可指定；否则用默认 DeepSeek 模型（'proxy' 是占位，不当真）
  body.model = (body.model && body.model !== 'proxy') ? body.model : DEEPSEEK_MODEL;

  // 3) 仅使用 DeepSeek 单一供应商
  const key = env.DEEPSEEK_API_KEY;
  if (!key) {
    return json({
      error: 'DeepSeek API key not configured',
      hint: '请在 EdgeOne 控制台环境变量中设置 DEEPSEEK_API_KEY',
    }, 502);
  }

  try {
    const upstream = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify(body),
    });
    if (!upstream.ok) {
      let detail = '';
      try { detail = (await upstream.text()).slice(0, 500); } catch (e) {}
      return json({ error: 'DeepSeek returned ' + upstream.status, detail }, 502);
    }
    // 成功拿到 200，直接把流透传回去（保住打字机效果）
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Upstream': 'DeepSeek',
      },
    });
  } catch (e) {
    return json({ error: 'Upstream request failed', detail: e.message }, 502);
  }
}
