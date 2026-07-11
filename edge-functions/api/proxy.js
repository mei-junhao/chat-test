// EdgeOne Makers 边缘函数 — 单供应商(DeepSeek)大模型代理
// 路由: edge-functions/api/proxy.js → /api/proxy
//
// 导出格式: Makers 使用 export default function onRequest(context)
//   context.request = 请求对象
//   context.env     = 环境变量（控制台设置）
//
// 环境变量:
//   ALLOWED_REFERER  = 逗号分隔的允许来源（可选，留空仅同源放行）
//   DEEPSEEK_API_KEY = sk-xxx

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function safePathname(raw) {
  try { return new URL(raw).pathname; } catch (e) {}
  const q = (raw || '').indexOf('?');
  return q >= 0 ? raw.slice(0, q) : (raw || '/');
}

function safeHost(raw) {
  try { return new URL(raw).host.toLowerCase(); } catch (e) { return ''; }
}

function allowedReferers(env, rawUrl) {
  const raw = (env.ALLOWED_REFERER || '').toLowerCase();
  const list = raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  const host = safeHost(rawUrl);
  if (host) list.push(host);
  return list;
}

// ── Makers 统一入口 ──
export default function onRequest(context) {
  // EventContext: { request, env, params, waitUntil }
  const request = context.request;
  const env = context.env || {};

  const method = (request.method || '').toUpperCase();
  const pathname = safePathname(request.url);
  const origin = request.headers.get('origin') || '*';

  // OPTIONS 预检
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  // GET — 健康自诊 + 状态页
  if (method === 'GET') {
    if (pathname.includes('/health')) {
      const diag = {
        ok: true,
        functionHost: safeHost(request.url) || '(unknown)',
        matchedPathname: pathname,
        deepseekConfigured: !!env.DEEPSEEK_API_KEY,
        envKeyCount: Object.keys(env).length,
        envKeyNames: Object.keys(env).join(', ') || '(empty!)',
        allowedReferers: allowedReferers(env, request.url),
      };
      return new Response(JSON.stringify(diag, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return json({ ok: true, hint: 'POST /api/proxy | GET /api/proxy/health' }, 200, origin);
  }

  // POST — 代理转发 DeepSeek
  if (method === 'POST') {
    return handlePost(request, env);
  }

  return new Response('Method not allowed', { status: 405 });
}

async function handlePost(request, env) {
  // 防盗刷
  const allowed = allowedReferers(env, request.url);
  const referer = (request.headers.get('referer') || request.headers.get('origin') || '').toLowerCase();
  if (env.ALLOWED_REFERER && env.ALLOWED_REFERER.trim() !== '' && referer) {
    if (!allowed.some(a => referer.includes(a))) {
      return json({ error: 'Forbidden: invalid referer', got: referer, allowed }, 403);
    }
  }

  let body;
  try { body = await request.json(); } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  body.stream = true;
  if (!body.max_tokens || body.max_tokens <= 0) body.max_tokens = 2048;
  body.model = (body.model && body.model !== 'proxy') ? body.model : DEEPSEEK_MODEL;

  const key = env.DEEPSEEK_API_KEY;
  if (!key) {
    return json({
      error: 'DeepSeek API key not configured',
      hint: '请在控制台设置 DEEPSEEK_API_KEY',
      envKeyNames: Object.keys(env).join(', ') || '(empty!)',
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
