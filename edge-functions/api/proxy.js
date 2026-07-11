// EdgeOne 边缘函数 — 单供应商(DeepSeek)大模型代理，隐藏 API Key
// 路由: /api/proxy  （由 edge-functions/api/proxy.js 自动映射）
// 部署: 把 edge-functions/ 上传到 EdgeOne Pages/Makers，函数自动挂在 /api/proxy
//
// 环境变量（在 EdgeOne 控制台「环境变量」中设置）:
//   ALLOWED_REFERER  = （可选）逗号分隔的允许来源，防盗刷；留空则仅用同源白名单
//   DEEPSEEK_API_KEY = sk-xxx   ← 唯一需要的 Key

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// 安全提取 pathname（兼容完整 URL 和相对路径，避免 new URL 抛异常）
function safePathname(request) {
  const raw = request.url || '';
  try { return new URL(raw).pathname; } catch (e) {}
  // 降级：手动提取（相对路径如 /api/proxy/health）
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  return path || '/';
}

// 安全提取 host（用于同源白名单）
function safeHost(request) {
  const raw = request.url || '';
  try { return new URL(raw).host.toLowerCase(); } catch (e) { return ''; }
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
  const host = safeHost(request);
  if (host) list.push(host);
  return list;
}

// ── OPTIONS 预检 ──
export function onRequestOptions(context) {
  const origin = context.request.headers.get('origin') || '*';
  return new Response(null, { headers: corsHeaders(origin) });
}

// ── GET（/health 自诊） ──
export function onRequestGet(context) {
  const pathname = safePathname(context.request);
  // 匹配任何包含 /health 的 GET 请求（无论路径前缀如何）
  if (pathname.includes('/health')) {
    const env = getEnv(context);
    const diag = {
      ok: true,
      functionHost: safeHost(context.request) || '(unknown)',
      matchedPathname: pathname,
      allowedReferers: allowedReferers(env, context.request),
      deepseekConfigured: !!env.DEEPSEEK_API_KEY,
      env: Object.keys(env).length ? 'has keys (count=' + Object.keys(env).length + ')' : 'EMPTY — 环境变量未取到!',
    };
    return new Response(JSON.stringify(diag, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  // 非 /health 的 GET → 简要状态页
  return json({ ok: true, hint: 'POST /api/proxy 发送消息；GET /api/proxy/health 自诊' }, 200);
}

// ── POST（代理对话） ──
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

  // 2) 解析请求体
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  body.stream = true;
  if (!body.max_tokens || body.max_tokens <= 0) body.max_tokens = 2048;
  body.model = (body.model && body.model !== 'proxy') ? body.model : DEEPSEEK_MODEL;

  // 3) 仅使用 DeepSeek 单一供应商
  const key = env.DEEPSEEK_API_KEY;
  if (!key) {
    return json({
      error: 'DeepSeek API key not configured',
      hint: '请在 EdgeOne 控制台环境变量中设置 DEEPSEEK_API_KEY',
      envHasKeys: Object.keys(env).length,
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
