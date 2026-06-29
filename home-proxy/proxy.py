#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Home Proxy: DeepSeek API 本地代理
# Key 从环境变量 DEEPSEEK_API_KEY 读取，永不写入代码
# 用法: set DEEPSEEK_API_KEY=sk-xxx && python proxy.py
# 监听 localhost:9000

import os
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions'


class ProxyHandler(BaseHTTPRequestHandler):

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_GET(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()
        self.wfile.write(b'OK - DeepSeek Proxy Running')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len)

        try:
            body_str = body.decode('utf-8')
        except UnicodeDecodeError:
            body_str = body.decode('latin-1')
        try:
            data = json.loads(body_str)
        except json.JSONDecodeError:
            self.send_response(400)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(('Invalid JSON: ' + body_str[:200]).encode())
            return

        api_key = os.environ.get('DEEPSEEK_API_KEY')
        if not api_key:
            self.send_response(500)
            self._cors_headers()
            self.end_headers()
            self.wfile.write(b'DEEPSEEK_API_KEY not configured')
            return

        # Force stream for better UX
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

            proxy_res = urllib.request.urlopen(req, timeout=120)
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
        pass  # 安静模式，不打印日志


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 9000))
    server = HTTPServer(('0.0.0.0', port), ProxyHandler)
    print(f'DeepSeek Proxy running on port {port}')
    server.serve_forever()
