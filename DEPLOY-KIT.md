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

## B. 腾讯 EdgeOne Makers（你选的「边缘函数」）

> 函数文件：`edge-functions/api/proxy.js`，线上路径固定为 `/api/proxy`。
> 已补全 `GET /health`，可被 `proxy.js` 自动探测。无响应体限制、原生 SSE 流式。

### 方式一：CLI 部署（推荐，可脚本化）

```bash
# 1) 装 CLI（需 Node / npm）
npm install -g edgeone
edgeone -v                       # 看到版本号即成功

# 2) 登录（选 China 国内站）
edgeone login                    # 弹浏览器授权；或 export EDGEONE_API_TOKEN=xxx 后免登录

# 3) 准备项目：把本仓库的 edge-functions/ 放到一个 EdgeOne Makers 项目根目录
#    （控制台新建 Makers 项目后 git 克隆到本地，再把 proxy.js 放进 edge-functions/api/）
cp -r edge-functions ./makers-project/   # 或直接在克隆的项目里编辑

# 4) 关联 / 新建项目（在函数所在目录执行）
cd makers-project
edgeone makers init              # 若尚未初始化（会生成 edge-functions/cloud-functions 样板）
edgeone makers link -n <你的Makers项目名>   # 关联已建项目；不存在则按提示新建

# 5) 注入 key（只进 Makers 环境变量，不进文件/前端）
edgeone makers env set DEEPSEEK_API_KEY 'sk-你的key' -t <EDGEONE_API_TOKEN>
#    也可在 Makers 控制台「环境变量」页面手动填 DEEPSEEK_API_KEY

# 6) 部署
edgeone makers deploy -n <你的Makers项目名> -e production
#    成功后给出线上 URL，形如：
#      https://<项目名>.<edgeone域名>/api/proxy
#    或你绑定的自定义域名：https://你的域名/api/proxy
```

### 方式二：控制台部署（不想碰 CLI）

1. Makers 控制台新建项目 → 在函数目录 `edge-functions/api/` 下新建 `proxy.js`，粘贴本仓库 `edge-functions/api/proxy.js` 全文。
2. 项目设置 → 环境变量 → 新增 `DEEPSEEK_API_KEY=你的key`（**只填这里**）。
3. 点击「部署」，拿到 `https://<域名>/api/proxy`。

### 本地 dev 预检（零成本，先确认函数能跑）

```bash
edgeone makers dev               # 本地起服务，默认 http://localhost:8088
# 另开终端：
curl -i http://localhost:8088/api/proxy/health     # 应返回 200 ok
python3 verify_proxy.py --url http://localhost:8088/api/proxy --name EdgeOne-dev
#   注：dev 也需要 DEEPSEEK_API_KEY —— 用 edgeone makers env set 或本地 .env 提供
```

> ⚠️ EdgeOne Makers 的访问路径由文件位置决定（`edge-functions/api/proxy.js` → `/api/proxy`），
> 所以 `proxy.js` 的 `#proxy=` 地址要写**含 `/api/proxy` 的完整地址**，
> 例如 `https://你的域名/api/proxy`（不要再补 `/chat` 之类后缀）。

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
# 你选的对比：腾讯 EdgeOne（边缘） vs 腾讯 SCF（云函数）
python3 verify_proxy.py \
  --url https://<你的域名>/api/proxy                       --name EdgeOne \
  --url https://<id>.apigw.tencentcs.com/release/...      --name SCF
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

你选了 **EdgeOne（腾讯边缘）** 作为边缘函数对手，与 **SCF（腾讯云函数）** 对比。预期结论：

- **EdgeOne（边缘）**：无响应体限制、原生 SSE 流式、`new Response(response.body)` 透传，最省心。verify 应直接 `PASS(streaming)`。国内边缘、与 DeepSeek 同生态，延迟更优。
- **SCF Web Function**：可用但最繁琐——必须 Web Function + API 网关开 SSE 流式；若漏开 SSE 开关，虽能用但是「整段缓冲」（`PASS(buffered)`）；普通函数（6MB 限制）则直接不可用。

只要两边都跑出 `PASS(streaming)`，说明「边缘 vs 云函数」在代理 DeepSeek 这事上都能用；区别只在部署繁琐度与延迟。把 `verify_proxy.py` 的两行结果贴回来，我帮你出最终对比结论。

> 注：若你只想先用 EdgeOne 跑通验证（暂不上 SCF），把上面命令里 SCF 那行删掉即可，单跑 `python3 verify_proxy.py --url https://<域名>/api/proxy --name EdgeOne`。
