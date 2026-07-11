// EdgeOne Makers 边缘函数 — DeepSeek API 代理
// 文件位置: ./edge-functions/api/proxy.js  →  线上路由: https://你的域名/api/proxy
// 写法依据: 腾讯云 Edge Functions 文档(1552/127416)「Function Handlers」——
//           方法专属命名导出 onRequestPost/onRequestGet/onRequestOptions 为官方支持写法。
// 平台限制(127416): 请求 body ≤1MB、CPU 时间片 200ms(不含I/O)、代码包 ≤5MB、仅 JS(ES2023+)。
// 环境变量: DEEPSEEK_API_KEY (在 Makers 控制台/CLI 设置，绝不进源码)

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
