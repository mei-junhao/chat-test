#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Launcher: 启动代理 + cloudflared 隧道
# 用法: set DEEPSEEK_API_KEY=sk-xxx && python launcher.py

import os
import sys
import subprocess
import threading
import time
import re

KEY = os.environ.get('DEEPSEEK_API_KEY', '')
if not KEY:
    print('Error: DEEPSEEK_API_KEY not set')
    sys.exit(1)

PROXY_PORT = 9000


def start_proxy():
    """在后台线程启动代理"""
    from http.server import HTTPServer
    import importlib.util

    # 加载 proxy.py 模块
    spec = importlib.util.spec_from_file_location(
        "proxy",
        os.path.join(os.path.dirname(__file__), "proxy.py")
    )
    proxy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(proxy)

    # proxy.py 的 if __name__ == '__main__' 块不会执行
    # 手动创建服务器
    server = HTTPServer(('0.0.0.0', PROXY_PORT), proxy.ProxyHandler)
    print(f'Proxy listening on port {PROXY_PORT}')
    server.serve_forever()


def find_cloudflared():
    """查找 cloudflared 二进制"""
    candidates = [
        'cloudflared',
        'cloudflared.exe',
    ]
    import shutil
    for c in candidates:
        p = shutil.which(c)
        if p:
            return p
    return None


def start_tunnel():
    """启动 cloudflared 隧道并返回公网 URL"""
    cf = find_cloudflared()
    if not cf:
        print('WARNING: cloudflared not found. Install: npm install -g cloudflared')
        print('Then manually run: cloudflared tunnel --url http://localhost:9000')
        return None

    print(f'Found cloudflared: {cf}')
    cmd = [cf, 'tunnel', '--url', f'http://localhost:{PROXY_PORT}', '--no-autoupdate']

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        # 等待 tunnel URL 出现
        deadline = time.time() + 30
        url = None
        for line in iter(proc.stdout.readline, ''):
            print(f'[tunnel] {line.strip()}')
            # cloudflared v2 输出: https://xxx.trycloudflare.com
            m = re.search(r'(https://[a-z0-9-]+\.trycloudflare\.com)', line)
            if m:
                url = m.group(1)
                break
            if time.time() > deadline:
                break

        return url
    except Exception as e:
        print(f'cloudflared failed: {e}')
        return None


if __name__ == '__main__':
    print('=== DeepSeek Home Proxy Launcher ===')
    print(f'Key: {KEY[:10]}...{KEY[-4:]}')
    print()

    # 启动代理线程
    t = threading.Thread(target=start_proxy, daemon=True)
    t.start()
    time.sleep(1)

    # 启动隧道
    print('Starting cloudflared tunnel...')
    url = start_tunnel()

    if url:
        print()
        print('=' * 60)
        print(f'  TUNNEL URL: {url}')
        print(f'  Copy this into DEFAULT_API in index.html')
        print('=' * 60)
        print()
        print('Press Ctrl+C to stop.')
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print('\nShutting down...')
    else:
        print()
        print('Tunnel not available. Using localhost only.')
        print(f'Proxy: http://localhost:{PROXY_PORT}')
        print('Press Ctrl+C to stop.')
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print('\nShutting down...')
