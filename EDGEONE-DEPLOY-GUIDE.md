# 腾讯 EdgeOne Makers 边缘函数部署详尽指南（DeepSeek 代理）

> 本文档面向「把 `edge-functions/api/proxy.js` 部署到腾讯云 EdgeOne Makers，作为 chat-test 的远程 DeepSeek 代理（边缘函数方案）」这一具体目标，给出**一步步、可照抄**的操作。
>
> **文档核查日期：2026-07-11**。所引用的腾讯云官方文档最近更新于 **2026-06-12**（属当前最新版），关键链接见文末「官方文档索引」。本文中所有命令均来自官方 CLI 文档与 Edge Functions 文档，并与仓库内函数代码逐条对齐。

---

## 0. 先确认：这份文档解决了什么

- 你要测「边缘函数 vs SCF 哪个能用」。你已选定 **腾讯 EdgeOne Makers 边缘函数** 作为边缘函数一方。
- 本文档 = EdgeOne 这一方的**完整、最新、可照抄**部署手册。
- 安全铁律（全文遵守）：`DEEPSEEK_API_KEY` **只**出现在 EdgeOne Makers 的「环境变量」里，**绝不**写进任何源码、配置文件或前端 HTML。本仓库函数代码全部从 `context.env` 读取 key。

---

## 1. 它是什么 / 为什么选它

**EdgeOne Makers** = 原「EdgeOne Pages」升级后的 Serverless 平台。它把你的代码部署在 **EdgeOne 全球 3200+ 边缘节点**，请求自动调度到离用户最近的节点执行。

Makers 提供两类 Functions：

| 类型 | 运行位置 | 冷启动 | 运行时 | 适用 |
|------|----------|--------|--------|------|
| **Edge Functions**（我们用这个） | 全球边缘节点 | 毫秒级 | Edge Runtime（V8 / Web Service Worker API，JS） | 高并发、低延迟、短执行 |
| Cloud Functions | 云端服务器 | 百毫秒级 | Node.js / Python / Go | 复杂计算、长执行 |

我们要做的只是「边收边转发 DeepSeek 的 SSE 流」，属于典型的轻量、低延迟、I/O 密集场景 → **Edge Functions 完美契合**。

**相对 SCF 的优势**（这也是你选它的理由）：
- **无响应体限制**：边缘函数对返回体大小没有 SCF 普通函数那样的 6MB 硬限。
- **原生 SSE 流式**：底层是标准 Web Streams API，`new Response(upstream.body)` 直接透传，不缓冲整段。
- **部署简单**：一个 CLI 命令 `edgeone makers deploy` 搞定，无需配 API 网关、无需管服务器。
- **国内边缘**：与 DeepSeek 同属国内网络，延迟更优。

---

## 2. 平台限制（部署前必须知道，避免踩坑）

来自官方 Edge Functions 文档（127416）「使用限制」：

| 限制项 | 数值 | 对我们的影响 |
|--------|------|--------------|
| 代码包大小 | **≤ 5 MB** | 我们的 `proxy.js` 不到 2 KB，无碍 |
| **请求 body 大小** | **≤ 1 MB** | 聊天请求 JSON 很小（几 KB），无碍；但**不要**拿它传大文件 |
| **CPU 时间片** | **200 ms** | 指 CPU 占用时间，**不含 I/O 等待**。纯代理只是 `fetch` + 透传流，CPU 几乎不花时间，足够；长回复靠流式 I/O 完成，不占 CPU 配额 |
| 开发语言 | 仅 **JavaScript（ES2023+）** | 我们的 `proxy.js` 是 JS，契合 |
| 运行时 API | Web Service Worker 标准：`fetch` / `Request` / `Response` / `ReadableStream` / `Headers` / `Cache` / `Web Crypto` 等 | SSE 透传依赖的 `Response` + Streams 全部原生支持 |

> **结论**：对本代理场景，平台限制全部不构成障碍。唯一要留意的真实风险是「key 没配置 / 环境变量改动后没重新部署」，见第 12 节排错。

---

## 3. 项目结构与路由映射（最关键的概念）

Edge Functions **基于目录结构生成路由**（`/edge-functions` 目录下的文件路径 → URL 路径）。规则：

```
你的 Makers 项目/
└── edge-functions/                 ← 固定目录名，平台据此生成路由
    └── api/
        └── proxy.js                ← 这个文件
```

映射结果：

| 文件路径 | 线上访问路由 |
|----------|--------------|
| `edge-functions/api/proxy.js` | `https://<你的域名>/api/proxy` |

也就是说，**函数文件名叫什么、放在哪一层，就决定了线上路径**。我们的代理地址就是 `<域名>/api/proxy`，记住它，后面 `#proxy=` 和 verify 都用它。

> 路由大小写敏感；`api/proxy.js` 不会匹配 `/API/Proxy`。

### 3.1 函数导出写法（已对照官方规范确认）

官方 Edge Functions 文档「Function Handlers」明确支持**方法专属命名导出**：

```js
export function onRequest(context)        { /* 匹配所有方法 */ }
export function onRequestGet(context)     { /* 仅 GET  */ }
export function onRequestPost(context)    { /* 仅 POST */ }
export function onRequestOptions(context) { /* 仅 OPTIONS（CORS 预检）*/ }
```

我们仓库的 `edge-functions/api/proxy.js` **正是这个写法**（`onRequestOptions` / `onRequestGet` / `onRequestPost` 三个命名导出）。**经核查，这与 EdgeOne Makers 官方规范完全一致，无需改写即可直接部署。**

> ⚠️ 误区提醒：有些概述页只贴了最简的 `export default function onRequest(context)` 单处理器示例，容易让人误以为「必须用 default 单导出」。实际上方法专属命名导出（`onRequestPost` 等）是官方明文支持的写法，我们的代码没问题。

### 3.2 `context` 对象里有什么（我们的代码用到哪些）

| 字段 | 含义 | 我们的用法 |
|------|------|-----------|
| `context.request` | 客户端请求（`Request` 对象） | `context.request.json()` 取聊天参数；`context.request.url` 取路径做 health 判断 |
| `context.env` | Makers 环境变量 | `context.env.DEEPSEEK_API_KEY` 读取 key |
| `context.params` | 动态路由参数 | 本函数未用 |
| `context.waitUntil(promise)` | 延长函数生命周期等待异步任务 | 本函数未用 |

---

## 4. 前置条件

开始前请确认：

1. **腾讯云账号**，并在控制台开通 **Makers 服务**（入口：控制台 → 边缘安全加速平台 EO → Makers / Pages）。
2. **本地 Node.js ≥ 18**（EdgeOne CLI 需要）。
3. **npm**（随 Node 自带）。
4. 你的 **DeepSeek API Key**（`sk-...`）——只准备着，稍后填进 Makers 环境变量，**不要**写进任何文件。
5. （可选，但对外长期使用建议）一个**自有域名**，用于绑定自定义域名。若加速区域含中国大陆，域名须先完成 **ICP 备案**。

---

## 5. 安装并登录 EdgeOne CLI

```bash
# 1) 全局安装 CLI
npm install -g edgeone

# 2) 验证安装
edgeone -v          # 看到版本号即成功
edgeone -h          # 查看全部命令

# 3) 登录（弹浏览器授权；建议选 China 国内站）
edgeone login

# 4) 确认当前账号
edgeone whoami      # 显示已登录账号信息
```

> **双命名空间说明**：CLI 同时提供 `edgeone makers <cmd>`（新，推荐）和 `edgeone pages <cmd>`（老，过渡期可用，等价）。本文统一用 `edgeone makers ...`。过渡期内老命令不会被下线。

---

## 6. 准备 Makers 项目并放入我们的函数

有两种起点，都行：

### 6.1 方式 A：用现有仓库（推荐，最干净）

1. 在 EdgeOne Makers 控制台新建一个 Makers 项目（记下项目名，假设叫 `winnicott-proxy`）。
2. 把本仓库的 `edge-functions/` 整个目录复制进该项目根目录（确保最终是 `<项目>/edge-functions/api/proxy.js`）。
3. 若项目里还没有 `edge-functions/` 目录，先跑初始化生成样板，再把我们的 `proxy.js` 放进去：
   ```bash
   cd <你的 Makers 项目根目录>
   edgeone makers init     # 生成 edge-functions/ 或 cloud-functions/ 样板
   # 然后把本仓库的 edge-functions/api/proxy.js 复制覆盖/放入对应位置
   ```

### 6.2 方式 B：从模板从零建（不推荐，模板多是 Agent/前端框架）

```bash
edgeone makers create winnicott-proxy --template <slug>
# 仅用于拉官方模板起步；纯函数项目还是方式 A 更直接
```

> 无论哪种方式，最终目标是：项目根目录下存在 `edge-functions/api/proxy.js`，且线上路由为 `/api/proxy`。

---

## 7. 配置环境变量 DEEPSEEK_API_KEY（安全核心）

key **只**进 Makers 环境变量。两种方式任选其一：

### 7.1 控制台（最直观）

Makers 控制台 → 你的项目 → **环境变量**（或「设置 / Environment Variables」）→ 新增：
- 变量名：`DEEPSEEK_API_KEY`
- 变量值：`sk-你的真实key`

### 7.2 CLI（可脚本化）

```bash
# 新增 / 修改
edgeone makers env set DEEPSEEK_API_KEY 'sk-你的真实key'

# 查看已配置的所有环境变量
edgeone makers env ls

# 拉取控制台环境变量到本地（本地调试用）
edgeone makers env pull

# 删除
edgeone makers env rm DEEPSEEK_API_KEY
```

> 🔴 **关键**：**环境变量改动后，必须重新执行一次 `edgeone makers deploy`**，改动才会进入线上运行环境。只改 env 不重新部署 = 线上仍用旧 env。

---

## 8. 本地开发预检（强烈建议先做，零成本排错）

在部署到公网前，先本地跑通，避免反复上线调试。

```bash
cd <你的 Makers 项目根目录>

# 1) 关联项目（把控制台 env 同步到本地调试）
edgeone makers link -n winnicott-proxy

# 2) 启动本地 dev 服务（默认端口 8088）
edgeone makers dev
#   提示：Makers 函数服务与前端服务同端口，无需额外代理
#   访问 http://localhost:8088/ 看前端；函数路径即文件路由 /api/proxy
```

另开一个终端，验证函数：

```bash
# (a) 健康检查 —— 应返回 200 + "ok"
curl -i http://localhost:8088/api/proxy/health

# (b) 用我们的实测脚本（纯标准库，无需 pip）
#     注意本地 dev 也要能读到 DEEPSEEK_API_KEY（已 link + 控制台配置即可）
python3 verify_proxy.py --url http://localhost:8088/api/proxy --name EdgeOne-dev
#   期望：health 200，PASS(streaming)，[DONE] yes
```

> 注：纯 Edge Functions 的 dev 默认端口为 **8088**（部分 Agent 框架模板用 8080，我们这是函数，用 8088）。若 `edgeone makers dev` 报错说读不到 key，确认已 `link` 且控制台 env 已配；CI / 无登录环境可加 `-t <EDGEONE_API_TOKEN>`。

本地预检通过后再上线，能省掉 90% 的线上排错时间。

---

## 9. 部署上线

```bash
cd <你的 Makers 项目根目录>

# 生产环境部署（项目不存在会自动创建）
edgeone makers deploy -n winnicott-proxy -e production
```

部署成功后，控制台会给出线上访问 URL。两种形态：

- **平台默认临时域名**（用于快速验证，限时）：`https://<项目子域>.<edgeone默认域名>/api/proxy`
- **你绑定的自定义域名**（见第 10 节）：`https://proxy.你的域名.com/api/proxy`

> **CI / 无登录部署**（用 API Token，Token 在控制台「API Token」页面生成）：
> ```bash
> edgeone makers deploy -n winnicott-proxy -t <EDGEONE_API_TOKEN> -e production
> ```

> 也可走 Git 部署：把项目推到 GitHub/Gitee/Coding，在 Makers 导入仓库，对 `main` 分支的每次提交自动触发部署。

---

## 10. 自定义域名（可选，但对外长期使用强烈建议）

平台默认临时域名仅限短期预览。要稳定对外，绑定自有域名：

1. 控制台 → 项目 → **域名管理** → 添加自定义域名（如 `proxy.你的域名.com`）。
2. 按弹窗指引在域名注册商处**添加解析记录**验证归属权。
3. 配置 **CNAME** 记录指向 EdgeOne 提供的地址。
4. **HTTPS 配置**（必须）：
   - 无证书用户：选「申请免费证书」——EdgeOne 提供自动申请、自动续签、自动部署的免费证书。
   - 已有证书：上传自有证书。
5. 关联环境：生产环境 → 关联 `main` 分支；预览环境 → 关联其他分支。

> ⚠️ 若加速区域为「中国大陆」或「全球（含中国大陆）」，**添加的域名须先完成 ICP 备案**，否则无法绑定。
> ⚠️ chat-test 页面是 `https://mei-junhao.github.io/...`（HTTPS）。你的代理域名**也必须 HTTPS**，否则浏览器会因「混合内容」拦截来自 HTTPS 页面对 HTTP 代理的请求。

绑定后，代理地址即 `https://proxy.你的域名.com/api/proxy`。

---

## 11. 接入 chat-test 网页（前端不再持 key）

把部署好的地址写进页面 URL 的 hash `#proxy=`：

```
https://mei-junhao.github.io/chat-test/master-chat.html#proxy=https://proxy.你的域名.com/api/proxy
```

`public/proxy.js` 的逻辑（已写好）：
1. 页面加载时探测 `#proxy=` 里的地址的 `/health`（即 `GET .../api/proxy/health`）。
2. 探测通过 → 把所有已知上游（`api.deepseek.com` / `api.kkdmx.com` / `apihub.agnes-ai.com`）的聊天请求**改走该代理**，并在转发时**剥离 `Authorization`**（key 只在云函数侧由 `context.env` 注入）。
3. 浏览器从此**不再持有 key**。首次成功后地址记入 `localStorage.remoteProxyUrl`，下次自动启用。

---

## 12. 远程实测（verify_proxy.py，出最终判读）

拿到线上 URL 后，在你自己机器跑：

```bash
cd chat-test
python3 verify_proxy.py --url https://proxy.你的域名.com/api/proxy --name EdgeOne
```

脚本会：① `GET /api/proxy/health` 探活；② `POST` 一个触发较长回复的 prompt，逐行读 SSE；③ 输出状态码 / TTFT / 总时长 / 总字节 / 事件数 / 是否 `[DONE]` / 判读。

**判读**：
- `FAIL` → 抛错 / 非 200 / 没 `[DONE]`（常见原因：key 未配置、env 改动未重新 deploy、路径写错）。
- `PASS(buffered)` → 通了但 TTFT≈总时长，说明流被缓冲（边缘函数一般不会出现，若出现多为网关/客户端问题）。
- `PASS(streaming)` → 真·流式、未截断，**可用性最佳**（边缘函数预期结果）。

---

## 13. CORS 跨域要点（github.io → 你的域名）

浏览器从 `mei-junhao.github.io` 调用 `proxy.你的域名.com` 属于**跨域**，且我们发的是带 `Content-Type: application/json` 的 POST → 会先发 **OPTIONS 预检**。

我们的 `proxy.js` 已正确处理：
- `onRequestOptions` 返回 `Access-Control-Allow-Origin: *` 等 CORS 头；
- `onRequestPost` 的响应也带 `Access-Control-Allow-Origin: *`。

确保：
1. 函数 OPTIONS 响应头齐全（代码已含）。
2. 代理域名启用 **HTTPS**（见第 10 节），否则被混合内容策略拦截。
3. 若你以后改了函数，记得重新 `edgeone makers deploy`。

---

## 14. 排错清单

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `GET /api/proxy/health` 返回 404/405 | 路径不对。探测地址应是 `.../api/proxy/health`（含 `/api/proxy` 前缀），不是 `/health` | 确认 verify / 浏览器用的是完整 `/api/proxy/health` |
| 线上报「key 未配置 / 401」 | `DEEPSEEK_API_KEY` 没配，或**配了没重新 deploy** | 控制台确认 env 存在；改完 env 后重跑 `edgeone makers deploy` |
| 跨域报错（CORS） | OPTIONS 未正确处理，或响应缺 ACAO 头 | 确认 proxy.js 的 `onRequestOptions` 与 POST 响应都带 `Access-Control-Allow-Origin: *`；重部署 |
| 浏览器混合内容拦截 | 代理域名是 HTTP，页面是 HTTPS | 给代理域名配 HTTPS（免费证书） |
| 请求体过大 | 单次聊天请求 > 1 MB（极少见） | 拆分请求；边缘函数 body 上限 1 MB |
| 长回复中断 | 超时（DeepSeek 慢） | 确认函数强制 `stream=true`（代码已强制）；检查客户端 / 网关超时设置 |
| dev 起不来 / 找不到 key | 未 `link` 或控制台 env 未配 | `edgeone makers link -n <项目>`；确认控制台 env 已设 |

---

## 15. 与 SCF（云函数）对比速览（你选定的对比）

| 维度 | **EdgeOne 边缘函数（你选的）** | 腾讯云 SCF Web Function |
|------|-------------------------------|--------------------------|
| 运行位置 | 全球边缘节点（低延迟） | 云端服务器 |
| 响应体限制 | **无** | 普通函数 6MB 硬限；Web Function 流式可避开 |
| 流式 SSE | 原生支持（Web Streams） | 需 Web Function + API 网关**开 SSE 流式**，否则被缓冲 |
| 部署复杂度 | **一行 `edgeone makers deploy`** | 较繁琐：建 Web Function + 配 API 网关 + 开 SSE 开关 |
| Key 管理 | Makers 环境变量 | SCF 环境变量 |
| 主要风险 | env 改动需重部署 | 漏开 SSE 开关 → `PASS(buffered)`；用错普通函数 → 6MB 截断 |

**预期结论**：两边都跑出 `PASS(streaming)` 即说明「边缘 vs 云函数」代理 DeepSeek 都能用；区别在部署繁琐度与延迟。EdgeOne 更省心。

---

## 16. 命令速查表（复制到终端即可）

```bash
# 安装 / 登录
npm install -g edgeone
edgeone -v
edgeone login            # 选 China
edgeone whoami

# 准备项目（在 Makers 项目根目录）
edgeone makers init      # 若无 edge-functions/ 则生成样板
#   把本仓库 edge-functions/api/proxy.js 放入 <项目>/edge-functions/api/proxy.js

# 配 key（只进环境变量）
edgeone makers env set DEEPSEEK_API_KEY 'sk-你的key'
edgeone makers env ls

# 本地预检
edgeone makers link -n winnicott-proxy
edgeone makers dev       # http://localhost:8088
curl -i http://localhost:8088/api/proxy/health
python3 verify_proxy.py --url http://localhost:8088/api/proxy --name EdgeOne-dev

# 上线
edgeone makers deploy -n winnicott-proxy -e production
# 或（CI / Token）：
edgeone makers deploy -n winnicott-proxy -t <EDGEONE_API_TOKEN> -e production

# 线上实测
python3 verify_proxy.py --url https://proxy.你的域名.com/api/proxy --name EdgeOne

# 网页使用
#   https://mei-junhao.github.io/chat-test/master-chat.html#proxy=https://proxy.你的域名.com/api/proxy
```

---

## 17. 官方文档索引（均为 2026-06-12 最近更新，本文核查基准）

- **EdgeOne CLI**：https://cloud.tencent.com/document/product/1552/127423
- **Edge Functions（函数签名 / 路由 / 限制 / context）**：https://cloud.tencent.com/document/product/1552/127416
- **Makers Functions 概览（Edge vs Cloud）**：https://cloud.tencent.com/document/product/1552/127415
- **快速开始**：https://cloud.tencent.com/document/product/1552/132786
- **自定义域名**：https://cloud.tencent.com/document/product/1552/127404
- **Makers Models（原生 SSE 流式说明）**：https://cloud.tencent.com/document/product/1552/127421
- **API Token 获取**：https://cloud.tencent.com/document/product/1552/127422

> 文档会持续更新；若命令有变，以控制台与上方官方链接的最新版为准。
