// EdgeOne Makers 边缘函数 — DeepSeek API 代理
// 文件位置: ./edge-functions/api/proxy.js
// 访问路径: https://你的域名/api/proxy
// 环境变量: DEEPSEEK_API_KEY (在 Makers 控制台设置)

const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';

// OPTIONS 预检
export function onRequestOptions(context) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// GET 健康检查（供前端 proxy.js 探测远程代理可用性）
export function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.pathname.endsWith('/health')) {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
  return new Response('Method not allowed', { status: 405 });
}

// POST 代理
export async function onRequestPost(context) {
  const body = await context.request.json();
  body.stream = true;

  const response = await fetch(DEEPSEEK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + context.env.DEEPSEEK_API_KEY,
    },
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/event-stream',
    },
  });
}
