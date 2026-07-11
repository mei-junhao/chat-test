#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_proxy.py — 部署后实测某个云函数代理能否真正流式透传 DeepSeek（不截断）。
只依赖 Python 标准库（无需 pip install / 无需任何密钥）。

为什么需要它：
  之前在免费 serverless 上代理 DeepSeek 时，长回复会被截断/不可用。
  本脚本直接向「已部署的云函数 URL」发一个会触发长回复的请求，
  逐行读取 SSE 流，量化以下指标，给出客观判读：
    - 状态码 / [DONE] 是否正常结束  ->  是否完整、未截断
    - 首字节时间(TTFT) vs 总时长     ->  是「真·流式」还是「网关缓冲成整段」

用法：
  python3 verify_proxy.py --url https://xxx.workers.dev
  python3 verify_proxy.py --url https://cf.workers.dev --url https://scf.apigw.tencentcs.com/release/xxx --url https://edge.example.com/api/proxy --name CF --name SCF --name EdgeOne

判读规则：
  FAIL              -> 抛错 / 状态码非 200 / 没收到 [DONE]（可能 key 未配置、6MB 限制、网关报错）
  PASS(buffered)    -> 通了但 TTFT≈总时长，说明 API 网关把流缓冲成整段返回（SCF 需开「SSE 流式/响应流式传输」）
  PASS(streaming)   -> 通了且真·流式、未截断，可用性最佳
"""
import sys, os, json, time, argparse, urllib.request, urllib.error

DEFAULT_PROMPT = (
    "请详细阐述唐纳德·温尼科特的「足够好的母亲」(good-enough mother)概念，"
    "要求：分至少五个小节，每节 300 字以上，引用其原意，并说明它与「原初母性灌注」"
    "和环境促进(environmental provision)的关系。请尽量详尽，不要省略任何一节。"
)


def stream_test(url, name, prompt, model, timeout):
    print("\n" + "=" * 64)
    print(f"[{name}]  POST {url}")
    print("=" * 64)

    # 1) 健康检查（Cloudflare / SCF / 已补全的 EdgeOne 都有；没有则跳过）
    health_url = url.rstrip("/") + "/health"
    try:
        h = urllib.request.urlopen(health_url, timeout=10)
        body = h.read().decode("utf-8", "replace")[:20]
        print(f"  health : GET {health_url} -> {h.status} {body!r}")
    except Exception as e:
        print(f"  health : GET {health_url} -> 跳过/不可用 ({type(e).__name__}: {e})")

    # 2) 流式 POST（函数端会强制 stream=true，这里显式带上更稳妥）
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": True,
        "temperature": 1.0,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
        method="POST",
    )

    t0 = time.time()
    ttft = None
    total_bytes = 0
    events = 0
    done_seen = False
    error = None
    status = None
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        status = resp.status
        # 逐行读取 SSE：每行到货即计时，可区分「真流式」与「整段缓冲」
        while True:
            line = resp.readline()
            if not line:
                break
            if ttft is None:
                ttft = time.time() - t0
            total_bytes += len(line)
            s = line.decode("utf-8", "replace")
            if s.startswith("data:"):
                events += 1
                if "DONE" in s:
                    done_seen = True
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            detail = e.read().decode("utf-8", "replace")[:200]
        except Exception:
            detail = ""
        error = f"HTTP {e.code}: {detail}"
    except Exception as e:
        error = f"{type(e).__name__}: {e}"

    t1 = time.time()
    total = t1 - t0
    stream_win = (total - ttft) if ttft is not None else 0
    streaming = (ttft is not None) and (stream_win > 1.5)

    print(f"  status : {status}")
    if error:
        print(f"  ERROR  : {error}")
    print(f"  TTFT   : {ttft:.2f}s" if ttft is not None else "  TTFT   : -")
    print(f"  total  : {total:.2f}s   stream窗口: {stream_win:.2f}s")
    print(f"  bytes  : {total_bytes}   events: {events}")
    print(f"  [DONE] : {'yes' if done_seen else 'NO'}")

    if error or (status != 200) or (not done_seen) or total_bytes == 0:
        verdict = "FAIL"
    elif not streaming:
        verdict = "PASS(buffered)"
    else:
        verdict = "PASS(streaming)"

    print(f"  VERDICT: {verdict}")
    return {
        "name": name, "url": url, "status": status, "ttft": ttft,
        "total": total, "bytes": total_bytes, "events": events,
        "done": done_seen, "streaming": streaming, "verdict": verdict,
        "error": error,
    }


def main():
    ap = argparse.ArgumentParser(description="部署后实测云函数代理的 DeepSeek 流式透传")
    ap.add_argument("--url", action="append", required=True, help="函数 POST 地址（可重复）")
    ap.add_argument("--name", action="append", default=[], help="对应名称（可重复，缺省用序号）")
    ap.add_argument("--prompt", default=DEFAULT_PROMPT)
    ap.add_argument("--model", default="deepseek-chat")
    ap.add_argument("--timeout", type=int, default=180, help="整体超时秒数")
    args = ap.parse_args()

    results = []
    for i, url in enumerate(args.url):
        name = args.name[i] if i < len(args.name) else f"func{i + 1}"
        results.append(stream_test(url, name, args.prompt, args.model, args.timeout))

    print("\n" + "#" * 64)
    print("SUMMARY")
    print("#" * 64)
    for r in results:
        print(f"  {r['verdict']:16} {r['name']:12} bytes={r['bytes']} "
              f"ttft={r['ttft']} total={r['total']:.1f}s done={r['done']}")

    pass_ok = [r for r in results if r["verdict"].startswith("PASS")]
    print(f"\n  可用(通过): {len(pass_ok)}/{len(results)}")
    for r in pass_ok:
        note = "真·流式" if r["streaming"] else "可用但网关缓冲(SCF需开SSE流式)"
        print(f"    - {r['name']}: {r['url']}  [{note}]")

    if pass_ok:
        print("\n提示: 把通过的 URL 填进 chat-test 的 #proxy= 即可在网页里用，例如:")
        for r in pass_ok:
            print(f"    https://mei-junhao.github.io/chat-test/master-chat.html#proxy={r['url']}")
    print()


if __name__ == "__main__":
    main()
