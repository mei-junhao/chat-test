#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# SCF Web Function — DeepSeek API 代理
# 环境变量: DEEPSEEK_API_KEY

import os
import sys
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions'


class ProxyHandler(BaseHTTPRequestHandler):

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        # 健康检查端点（供前端 proxy.js 探测远程代理可用性）
        if self.path.split('?')[0] == '/health':
            self.send_response(200)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'ok')
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len)

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'Invalid JSON')
            return

        api_key = os.environ.get('DEEPSEEK_API_KEY')
        if not api_key:
            self.send_response(500)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'DEEPSEEK_API_KEY not configured')
            return

        data['stream'] = True
        req_data = json.dumps(data).encode('utf-8')

        try:
            req = urllib.request.Request(
                DEEPSEEK_API,
                data=req_data,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + api_key,
                },
                method='POST'
            )

            proxy_res = urllib.request.urlopen(req, timeout=60)
            self.send_response(proxy_res.status)
            self._cors_headers()
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()

            while True:
                chunk = proxy_res.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(('Proxy error: ' + str(e)).encode())

    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 9000))
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    sys.stderr.write(f'Server starting on port {port}\n')
    server.serve_forever()
