# 腾讯云 SCF 代理部署指南（Web Function，流式不截断）

> ⚠️ 重要：必须用 `index.py`（Web Function，逐块流式）。
> 仓库里另一个 `index_20260623_001010_474.js` 是**普通函数**，它设 `body.stream = false`
> 会缓冲整段、且普通 SCF 同步返回值有 **6MB 硬限**（错误 407）会截断长回复，**不要用它**。

## 方式一：控制台部署（推荐，最直观）

1. 登录腾讯云 SCF 控制台 → 新建函数
2. 创建方式：**Web 函数**（不是「事件函数」）
3. 运行环境：Python 3.10（或 3.12）
4. 函数代码：将本目录 `index.py` + `scf_bootstrap` 一起上传（bootstrap 已存在：`#!/bin/bash\npython3 index.py`）
5. 高级配置 → 环境变量：添加 `DEEPSEEK_API_KEY = <你的真实 key>`
6. 触发器：API 网关（HTTP 触发）
   - **关键**：API 网关需开启「响应流式传输 / SSE」支持，否则流式会被缓冲
   - 路径：`/`（POST 代理）、`/health`（GET 探测）
7. 保存后，API 网关会给出一个公网 URL（如 `https://xxx.apigw.tencentcs.com/release/`）

## 方式二：Serverless Framework（CLI）

需安装：`npm i -g serverless`，并配置腾讯云凭证（`~/.serverless/tencent_credentials` 或环境变量
`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`）。

`serverless.yml`（已在本目录）配置 Web Function + API 网关。部署：

```bash
export DEEPSEEK_API_KEY=<你的key>
serverless deploy
```

## 验证

部署后验证流式透传：

```bash
# 健康检查
curl https://<你的SCF网关URL>/health

# 流式代理（应看到逐块返回的 SSE 数据，而非整段）
curl -N -X POST https://<你的SCF网关URL>/ \
  -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"你好，写一段长一点的话"}],"stream":true}'
```

若看到 token 逐块流出、长回复不被截断，说明 Web Function + API 网关 SSE 配置成功。

## 前端接入

在 chat-test 测试站 URL 后加 `#proxy=<SCF网关URL>` 即可启用，例如：

```
https://mei-junhao.github.io/chat-test/master-chat.html#proxy=https://xxx.apigw.tencentcs.com/release/
```

proxy.js 会自动探测 `/health` 并把聊天请求路由到该云函数（剥离 Authorization，key 只在函数侧）。
