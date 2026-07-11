# 部署工具包（DEPLOY-KIT）— 在 chat-test 上对比「边缘函数 vs SCF」代理 DeepSeek

> 目标：把 DeepSeek 的 key 从前端移除，放到云函数里（secret / 环境变量），
> 让 `chat-test` 通过 `#proxy=<URL>` 走云函数代理，并对比哪类函数真·流式、不截断。
>
> **安全铁律**：`DEEPSEEK_API_KEY` 只出现在云函数的「加密变量 / 环境变量」里，
> **绝不**写进任何源码、配置文件或前端。本仓库所有函数代码都从 `env` 读取 key。

---

## 0. 前置说明（先读）

- 本沙箱**无外网出口**，无法替你部署或 curl 实测。以下步骤请在**你自己的机器/控制台**完成。
- 三套候选代码都已就绪，接口完全一致：
  - `POST <函数地址>` → 强制 `stream=true`，SSE 透传 DeepSeek 回复
  - `GET  <函数地址>/health` → 返回 `200 ok`（EdgeOne 已补全）
- 部署完后用 `verify_proxy.py`（纯标准库，无需 pip）实测，给出客观判读。
- 验证通过后，把 URL 填进 chat-test 页面 hash 即可在网页里用。

### 三个候选

| 候选 | 代码文件 | 部署目标 | 响应体限制 | 备注 |
|------|----------|----------|-----------|------|
| A. 边缘函数 (Cloudflare) | `worker.js` + `wrangler.toml` | Cloudflare Workers | **无** | 免费、全球边缘、最省心 |
| B. 边缘函数 (腾讯) | `edge-functions/api/proxy.js` | EdgeOne Makers | **无** | 国内边缘、与 SCF 同生态 |
| C. 云函数 (腾讯) | `scf-proxy/index.py` + `scf_bootstrap` | SCF **Web Function** + API 网关 | 普通函数 6MB 硬限；**Web Function 流式无此问题** | 必须走 Web Function |

> ⚠️ **SCF 唯一真正的坑**：用「普通函数」(`index_20260623_001010_474.js`，`stream=false`)
> 会缓冲整段、受 6MB 限制 → 不可用。务必用 **Web Function** (`index.py`) 逐块 `read/flush`。
> 不过 DeepSeek 单条回复最大约 8k token（≈30KB），远低于 6MB，所以只要**不缓冲、用流式**就安全。

---

## A. Cloudflare Worker（推荐先试，最省心）

```bash
# 1) 装 wrangler（需 Node）
npm i -g wrangler
wrangler login            # 浏览器授权；或用 CF_API_TOKEN 环境变量

# 2) 进入仓库根（含 worker.js / wrangler.toml）
cd chat-test

# 3) 注入 key（只进 Cloudflare 加密变量，不进文件）
wrangler secret put DEEPSEEK_API_KEY

# 4) 部署
wrangler deploy
# 部署后得到的地址形如：
#   https://winnicott-chat-proxy.<你的子域>.workers.dev
```

得到的 `https://...workers.dev` 即为候选 A 的 POST 地址。

---

## B. 腾讯 EdgeOne Makers

1. 打开 EdgeOne Makers 控制台，新建/打开一个项目。
2. 把 `edge-functions/api/proxy.js` 的内容作为边缘函数部署（访问路径 `/api/proxy`）。
3. 在 Makers 环境变量里设置 `DEEPSEEK_API_KEY`（**只填这里**）。
4. 部署后地址形如 `https://<你的域名>/api/proxy`（POST 地址即含 `/api/proxy`）。

> 该函数已补全 `GET /health`，可与 Cloudflare / SCF 一样被 `proxy.js` 自动探测。

---

## C. 腾讯云 SCF Web Function（关键：必须用 Web Function + 开 SSE 流式）

**控制台方式（最直观）：**

1. 函数服务 → 新建 → **Web 函数** → 运行环境 Python 3.10+。
2. 上传 `scf-proxy/` 目录（`index.py` + `scf_bootstrap`），或在线粘贴 `index.py` 内容。
3. 函数配置里设置环境变量 `DEEPSEEK_API_KEY=你的key`（**只填这里**）。
4. 触发管理 → 创建 **API 网关**触发：
   - **必须开启「响应流式传输 / SSE」**（否则网关会把流缓冲成整段，verify 会显示 `PASS(buffered)`）。
   - 前端 `proxy.js` 走的是 `POST <网关地址>`，网关地址即候选 C 的 POST 地址。
5. 创建后拿到 API 网关地址，形如
   `https://<id>.apigw.tencentcs.com/release/...`

> ❌ 不要用仓库里的 `index_20260623_001010_474.js`（普通函数，`stream=false`，6MB 限制）。

**Serverless Framework 方式**：见 `scf-proxy/DEPLOY.md`。

---

## 1. 部署后实测（在你机器上跑）

```bash
cd chat-test
python3 verify_proxy.py \
  --url https://winnicott-chat-proxy.<子域>.workers.dev --name CF \
  --url https://<id>.apigw.tencentcs.com/release/...      --name SCF \
  --url https://<你的域名>/api/proxy                       --name EdgeOne
```

脚本会：
1. `GET <url>/health` 探活；
2. `POST` 一个触发**长回复**的 prompt，逐行读 SSE；
3. 输出：状态码 / TTFT / 总时长 / 总字节 / 事件数 / 是否 `[DONE]` / 判读。

**判读：**
- `FAIL` → 抛错 / 非 200 / 没 `[DONE]`（key 未配置、6MB 限制、网关报错）
- `PASS(buffered)` → 通了但 TTFT≈总时长，说明 API 网关缓冲了流（SCF 需开「SSE 流式」）
- `PASS(streaming)` → 真·流式、未截断，**可用性最佳**

---

## 2. 验证通过后，在 chat-test 网页里用

把通过的 URL 写进页面 hash 的 `#proxy=`：

```
https://mei-junhao.github.io/chat-test/master-chat.html#proxy=<函数地址>
```

`proxy.js` 会探测该地址的 `/health`，通过后把所有聊天请求改走云函数（浏览器不再持有 key）。
多个地址可切换：改 hash 即可；首次成功会记进 `localStorage.remoteProxyUrl`。

---

## 3. 最终怎么选（给你做决定的依据）

- **首选 Cloudflare Worker**：无响应体限制、原生 Streams、免费、部署一行命令。之前担心的「serverless 截断」在正确流式透传下不存在。
- **次选 EdgeOne**：若你要国内边缘 / 全腾讯生态，接口与 CF 一致，同样无限制。
- **SCF Web Function 可用但最繁琐**：必须 Web Function + API 网关开 SSE 流式；若漏开 SSE 开关，虽能用但是「整段缓冲」而非真流式（verify 会标 `PASS(buffered)`）。普通函数（6MB）则直接不可用。

把 `verify_proxy.py` 的三行结果贴回来，我帮你出最终对比结论。
