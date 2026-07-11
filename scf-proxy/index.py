#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SCF Web Function — DeepSeek 单供应商 API 代理（渐进测试版 v2）"""
import os, sys, json
from http.server import HTTPServer, BaseHTTPRequestHandler

# Python 3.6.1 的 urllib 可能在受限环境中延迟导入
# 放入 try 块防止模块加载失败导致容器启动超时
try:
    import urllib.request
    import urllib.error
    import socket
except Exception as e:
    sys.stderr.write("IMPORT FAILED: %s\n" % e)

DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"
TIMEOUT = 120

def is_allowed(headers):
    allowed = os.environ.get("ALLOWED_REFERER", "").strip()
    if not allowed:
        return True
    src = (headers.get("Referer") or headers.get("Origin") or "").lower()
    if not src:
        return True
    # 自动放行本地开发环境
    for local in ("localhost", "127.0.0.1", "192.168.", "10.", "172.16."):
        if local in src:
            return True
    return allowed in src

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("PROXY: %s\n" % (fmt % args))

    def do_GET(self):
        if self.path.endswith("/health"):
            diag = {
                "ok": True,
                "python": sys.version,
                "deepseekConfigured": bool(os.environ.get("DEEPSEEK_API_KEY", "").strip()),
                "envKeys": [k for k in os.environ if k.endswith("_KEY") or k == "ALLOWED_REFERER"],
            }
            body = json.dumps(diag, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "*")
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        # Referer 白名单
        if not is_allowed(self.headers):
            self.send_response(403)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return

        # 读取请求体
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw)
        except Exception:
            self.send_response(400)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return

        messages = data.get("messages")
        if not messages:
            self.send_response(400)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return

        key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        if not key:
            err = json.dumps({"error": "DEEPSEEK_API_KEY not configured"}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err)
            return

        payload = {
            "model": data.get("model", DEEPSEEK_MODEL),
            "messages": messages,
            "stream": True,
            "temperature": data.get("temperature", 0.7),
        }
        if data.get("max_tokens"):
            payload["max_tokens"] = data["max_tokens"]

        req_body = json.dumps(payload).encode()
        req = urllib.request.Request(
            DEEPSEEK_URL,
            data=req_body,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + key,
                "Accept": "text/event-stream",
            },
            method="POST",
        )

        try:
            upstream = urllib.request.urlopen(req, timeout=TIMEOUT)
        except urllib.error.HTTPError as e:
            body = ""
            try: body = e.read().decode()[:500]
            except: pass
            err = json.dumps({"error": "DeepSeek HTTP %d" % e.code, "detail": body}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err)
            return
        except Exception as e:
            err = json.dumps({"error": "Upstream: %s" % str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err)
            return

        if upstream.status != 200:
            err = json.dumps({"error": "DeepSeek status %d" % upstream.status}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err)
            try: upstream.close()
            except: pass
            return

        # SSE 流透传
        self.send_response(200)
        origin = self.headers.get("Origin", "*")
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Provider", "DeepSeek")
        self.end_headers()

        try:
            while True:
                chunk = upstream.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except Exception:
            pass
        finally:
            try: upstream.close()
            except: pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9000))
    server = HTTPServer(("0.0.0.0", port), Handler)
    sys.stderr.write("SCF proxy listening on port %d\n" % port)
    sys.stdout.flush()
    server.serve_forever()
