#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SCF Web Function — 多供应商大模型 API 代理（隐藏 Key 版）
========================================================
浏览器 ──> 函数 URL ──> 真实大模型 API
密钥只存在于 SCF 环境变量，永不进入前端代码。

特性：
  * 原生透传 SSE 流，打字机效果无损（逐 chunk 转发，不拼接整段）
  * 内置 5 层供应商回退（顺序与前端原 TIERS 一致）
  * Referer / Origin 白名单防盗刷
  * 密钥全部从环境变量读取
  * GET /health 自诊端点

部署：
  * 必须配合 scf_bootstrap 启动，监听端口 9000
  * 仅 /tmp 可写，本脚本不写文件，无第三方依赖
  * 环境变量（控制台配置）：
      ALLOWED_REFERER   = mei-junhao.github.io
      DEEPSEEK_API_KEY  = sk-...
      KKDMX_PRO_KEY     = sk-...   (可选，未配则跳过)
      KKDMX_FLASH_KEY   = sk-...   (可选)
      KKDMX_MINIMAX_KEY = sk-...   (可选)
      AGNES_API_KEY     = sk-...   (可选)
"""

import os
import sys
import json
import socket
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── 供应商配置 ──
# 列表顺序即回退优先级（至少配 DEEPSEEK_API_KEY 即可运行）
PROVIDERS = [
    {
        "name": "DeepSeek V4 Flash",
        "url": "https://api.deepseek.com/v1/chat/completions",
        "env": "DEEPSEEK_API_KEY",
        "model": "deepseek-v4-flash",
    },
    {
        "name": "DeepSeek Pro (kkdmx)",
        "url": "https://api.kkdmx.com/v1/chat/completions",
        "env": "KKDMX_PRO_KEY",
        "model": "deepseek-ai/deepseek-v4-pro",
    },
    {
        "name": "DeepSeek Flash (kkdmx)",
        "url": "https://api.kkdmx.com/v1/chat/completions",
        "env": "KKDMX_FLASH_KEY",
        "model": "deepseek-ai/deepseek-v4-flash",
    },
    {
        "name": "MiniMax M3 (kkdmx)",
        "url": "https://api.kkdmx.com/v1/chat/completions",
        "env": "KKDMX_MINIMAX_KEY",
        "model": "minimaxai/minimax-m3",
    },
    {
        "name": "Agnes",
        "url": "https://apihub.agnes-ai.com/v1/chat/completions",
        "env": "AGNES_API_KEY",
        "model": "agnes-2.0-flash",
    },
]

UPSTREAM_TIMEOUT = 120  # 单次生成最长等待秒数


def get_referer_or_origin(headers):
    return headers.get("Referer") or headers.get("Origin") or ""


def is_allowed(headers):
    allowed = os.environ.get("ALLOWED_REFERER", "").strip()
    if not allowed:
        return True  # 未配白名单时放行（部署后务必配置）
    src = get_referer_or_origin(headers)
    if not src:
        return True  # 无 Referer/Origin 时放行（curl 测试等场景）
    return allowed in src


def cors_headers(handler, request_headers):
    origin = request_headers.get("Origin")
    allow = origin if origin else "*"
    handler.send_header("Access-Control-Allow-Origin", allow)
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Expose-Headers", "X-Provider")


class ProxyHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        sys.stderr.write(("PROXY: " + fmt % args) + "\n")

    def _send_cors(self):
        cors_headers(self, self.headers)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        """健康自诊：返回各供应商密钥配置状态（不泄露 Key 值）"""
        if not self.path.endswith("/health"):
            self.send_response(404)
            self.end_headers()
            return

        env_keys = [k for k in os.environ.keys() if k.endswith("_KEY") or k == "ALLOWED_REFERER"]
        diag = {
            "ok": True,
            "type": "SCF Web Function",
            "providers": [
                {
                    "name": p["name"],
                    "configured": bool(os.environ.get(p["env"], "").strip()),
                }
                for p in PROVIDERS
            ],
            "allowReferer": os.environ.get("ALLOWED_REFERER", "") or "(未配置)",
            "envKeysFound": len(env_keys),
            "envKeyNames": env_keys,
        }
        diag_json = json.dumps(diag, ensure_ascii=False, indent=2)
        self.send_response(200)
        self._send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(diag_json.encode("utf-8"))

    def do_POST(self):
        # 1. 防盗刷白名单
        if not is_allowed(self.headers):
            self.send_response(403)
            self._send_cors()
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Forbidden: referer not allowed")
            return

        # 2. 解析请求体
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw)
        except Exception:
            self.send_response(400)
            self._send_cors()
            self.end_headers()
            self.wfile.write(b"Invalid JSON body")
            return

        messages = data.get("messages")
        if not isinstance(messages, list) or not messages:
            self.send_response(400)
            self._send_cors()
            self.end_headers()
            self.wfile.write(b"Missing 'messages'")
            return

        # 3. 依次回退调用供应商
        last_err = ""
        tried = []
        for p in PROVIDERS:
            api_key = os.environ.get(p["env"], "").strip()
            if not api_key:
                tried.append(p["name"] + " (未配Key)")
                continue

            payload = {
                "model": p["model"],
                "messages": messages,
                "stream": True,
                "temperature": data.get("temperature", 0.7),
            }
            if data.get("max_tokens"):
                payload["max_tokens"] = data["max_tokens"]

            req_body = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                p["url"],
                data=req_body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + api_key,
                    "Accept": "text/event-stream",
                },
                method="POST",
            )

            try:
                upstream = urllib.request.urlopen(req, timeout=UPSTREAM_TIMEOUT)
            except urllib.error.HTTPError as e:
                last_err = "%s -> HTTP %d" % (p["name"], e.code)
                tried.append(p["name"] + " (HTTP " + str(e.code) + ")")
                continue
            except (urllib.error.URLError, socket.timeout, OSError) as e:
                last_err = "%s -> %s" % (p["name"], e)
                tried.append(p["name"] + " (连接失败)")
                continue

            if upstream.status != 200:
                last_err = "%s -> status %d" % (p["name"], upstream.status)
                tried.append(p["name"] + " (status " + str(upstream.status) + ")")
                try: upstream.close()
                except: pass
                continue

            # 4. 命中：透传 SSE 流
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Provider", p["name"])
            self.end_headers()

            try:
                while True:
                    chunk = upstream.read(4096)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                pass
            finally:
                try: upstream.close()
                except: pass
            return

        # 5. 全部失败
        err_body = json.dumps({
            "error": "All providers failed",
            "lastError": last_err,
            "triedProviders": tried,
        }, ensure_ascii=False)
        self.send_response(502)
        self._send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(err_body.encode("utf-8"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9000))
    server = HTTPServer(("0.0.0.0", port), ProxyHandler)
    sys.stderr.write("SCF Web Function listening on port %d\n" % port)
    sys.stdout.flush()
    server.serve_forever()
