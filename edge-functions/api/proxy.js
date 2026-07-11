// EdgeOne Pages / Makers 边缘函数 — 多供应商大模型代理（隐藏 API Key）
// 路由: /api/proxy  （由 edge-functions/api/proxy.js 自动映射）
// 部署: EdgeOne Pages 项目 或 EdgeOne Makers
//
// 环境变量（在 EdgeOne 控制台「环境变量」中设置）:
//   ALLOWED_REFERER  = mei-junhao.github.io        # 仅放行该来源，防盗刷
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

export function onRequestOptions(context) {
  const origin = context.request.headers.get('origin') || '*';
  return new Response(null, { headers: corsHeaders(origin) });
}

// GET /api/proxy/health 健康检查
export function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.pathname.endsWith('/health')) {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  return new Response('Method not allowed', { status: 405 });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1) 防盗刷：Referer / Origin 白名单
  const allowed = (env.ALLOWED_REFERER || 'mei-junhao.github.io').toLowerCase();
  const referer = (request.headers.get('referer') || request.headers.get('origin') || '').toLowerCase();
  const origin  = request.headers.get('origin') || '*';
  if (!referer.includes(allowed)) {
    return json({ error: 'Forbidden: invalid referer' }, 403);
  }

  // 2) 解析请求体（前端只需传 messages / temperature / max_tokens）
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  body.stream = true;

  // 3) 逐层回退
  const tiers = buildTiers(env);
  let lastError = null;
  for (const t of tiers) {
    if (!t.key) continue;            // 缺密钥的层跳过
    body.model = t.model;            // 每层使用自己的模型
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
        continue;                    // 该层失败，试下一层
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
  return json({ error: 'All providers failed', detail: lastError }, 502);
}
