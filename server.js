const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Read Winnicott SKILL.md as system prompt
const skillPath = path.join(__dirname, 'winnicott-skill.md');
const systemPrompt = fs.readFileSync(skillPath, 'utf-8');

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;
  const apiKey = process.env.DEEPSEEK_API_KEY || '';

  if (!apiKey) {
    return res.status(500).json({ error: '未配置 API Key。请在服务端设置 DEEPSEEK_API_KEY 环境变量。' });
  }

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const postData = JSON.stringify({
    model: model || 'deepseek-chat',
    messages: fullMessages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: false
  });

  const options = {
    hostname: 'api.deepseek.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 60000
  };

  const proxyReq = https.request(options, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.error) {
          return res.status(500).json({ error: data.error.message || 'API 调用失败' });
        }
        res.json({
          content: data.choices[0].message.content,
          usage: data.usage
        });
      } catch (e) {
        res.status(500).json({ error: '解析响应失败' });
      }
    });
  });

  proxyReq.on('error', (e) => {
    res.status(500).json({ error: '连接AI服务失败: ' + e.message });
  });

  proxyReq.write(postData);
  proxyReq.end();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: '温尼科特式对话', promptSize: systemPrompt.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║  温尼科特式对话 — 公众号读者 AI    ║
  ║  Server running on port ${PORT}        ║
  ║  Health: http://localhost:${PORT}/api/health ║
  ╚══════════════════════════════════════╝
  `);
});
