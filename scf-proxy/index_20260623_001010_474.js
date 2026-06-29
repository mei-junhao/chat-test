// Tencent Cloud SCF — DeepSeek API 代理
// 部署为 API 网关触发器函数
// 环境变量：DEEPSEEK_API_KEY

const https = require('https');

const DEEPSEEK_API = 'api.deepseek.com';
const DEEPSEEK_PATH = '/v1/chat/completions';

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (e) { return null; }
  }
  return body;
}

exports.main_handler = async (event, context) => {
  const method = event.httpMethod || event.method || 'GET';

  // CORS 预检
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
      body: '',
    };
  }

  if (method !== 'POST') {
    return { statusCode: 405, headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '服务端未配置 DEEPSEEK_API_KEY' }),
    };
  }

  const body = parseBody(event.body);
  if (!body || !body.messages) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '请求体需包含 messages 字段' }),
    };
  }

  // 去掉 stream（SCF API 网关默认不流式，返回完整结果）
  body.stream = false;

  const postData = JSON.stringify(body);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: DEEPSEEK_API,
      path: DEEPSEEK_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: data,
        });
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 502,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'DeepSeek API 请求失败: ' + e.message }),
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'DeepSeek API 超时' }),
      });
    });

    req.write(postData);
    req.end();
  });
};
