# Winnicott Chat — 项目手册

> 最后更新：2026-06-29  
> 当前版本：v4  
> 生产环境：https://mei-junhao.github.io/winnicott-chat/ （GitHub Pages，固定 URL）  
> 入口文件：master-select.html（主页）  
> 仓库地址：https://github.com/mei-junhao/winnicott-chat

---

## 一、项目概述

精神分析大师 AI 对话平台。用户可以与温尼科特、拉康、弗洛伊德、克莱因、荣格、比昂、罗杰斯、贝克、亚隆等大师的 AI 模拟进行对话。

**技术栈：** 纯 HTML + CSS + JS，零框架单文件部署，CloudStudio 静态托管，localStorage 存储对话。

---

## 二、文件结构

```
winnicott-chat/
├── public/                          ← 部署目录（所有静态资源）
│   ├── master-select.html           ← ★ 主页：大师选择页（8 位大师卡片 + 留言板）
│   ├── winnicott-chat.html          ← 温尼科特/拉康双人对话 (v4, 107KB)
│   ├── master-chat.html             ← 多大师共享模板（?master=freud|klein|...），winnicott-chat 同级
│   ├── ai-supervisor.html           ← AI 督导（密码保护，基于 alice-perspective skill）
│   ├── index.html                   ← git 原版 v3.1（保留作参考）
│   ├── api.html                     ← API 测试页
│   │
│   ├── winnicott-knowledge.md       ← 温尼科特知识库（95KB）
│   ├── winnicott-knowledge-full.md  ← 温尼科特完整知识库（179KB）
│   ├── winnicott-emotional.md       ← 温尼科特情感模式（41KB）
│   ├── lacan-knowledge.md           ← 拉康知识库（15KB）
│   ├── freud-knowledge.md           ← 弗洛伊德知识库（5.4KB）
│   ├── klein-knowledge.md           ← 克莱因知识库（7.1KB）
│   ├── jung-knowledge.md            ← 荣格知识库（6.3KB）
│   ├── bion-knowledge.md            ← 比昂知识库（7.1KB）
│   ├── rogers-knowledge.md          ← 罗杰斯知识库（6.8KB）
│   ├── beck-knowledge.md            ← 贝克知识库（7.8KB）
│   ├── yalom-knowledge.md           ← 亚隆知识库（7.0KB）
│   │
│   ├── lacan-avatar.jpg             ← 拉康头像（45KB）
│   ├── reward-qr.jpg                ← 打赏二维码（150KB）
│   │
│   └── backup-*.html                ← 工作备份（可清理）
│
├── home-proxy/                      ← 家庭 PC 代理（cloudflared 隧道 + Python 代理）
├── server.js                        ← 本地开发服务器
├── version-release-notes.md         ← 版本发布说明（v3.4-v3.8）
└── PROJECT.md                       ← 本文件
├── package.json
├── version-release-notes.md         ← 版本发布说明（v3.4-v3.8）
└── PROJECT.md                       ← 本文件
```

---

## 三、页面架构

### 3.1 页面关系

```
master-select.html（大师选择页）
    ├── → winnicott-chat.html（温尼科特/拉康）
    └── → master-chat.html?master=freud（弗洛伊德）
         → master-chat.html?master=klein（克莱因）
         → master-chat.html?master=jung（荣格）
         → master-chat.html?master=bion（比昂）
         → master-chat.html?master=rogers（罗杰斯）
         → master-chat.html?master=beck（贝克）
         → master-chat.html?master=yalom（亚隆）
```

### 3.2 winnicott-chat.html 功能清单（v4，完整）

- 🎭 双人物切换（温尼科特 ↔ 拉康，含主题/知识库/温度标签切换）
- 🔄 四层自动降级：DeepSeek Pro → Flash → MiniMax M3 → Agnes
- 🌐 中英双语 i18n（完整字典）
- 📋 对话历史：多条记录保存/加载/删除
- ✂️ 转发：勾选消息生成分享卡片
- 📏 温度滑块 + 回复长度控制
- 🌙 暗黑模式（温尼科特：暖棕 / 拉康：深紫黑）
- 🔌 自用 API 模式 + 快速预设
- 🟢 API 线路健康检测
- ☕ 打赏弹窗
- 📥 导出对话
- 🤖 AI 督导链接
- 💡 反馈/匿名问卷
- 📖 对话自动章节分隔
- 📊 访问统计（busuanzi）

### 3.3 master-chat.html 功能

- 通过 `?master=` 参数切换 7 位大师
- 每位大师独立知识库文件
- 共享 API 路由和降级逻辑（与 winnicott-chat.html 相同）
- 个性化主题色 + Wikipedia 真实照片
- 左上角"← 返回"按钮指向 master-select.html

### 3.4 ai-supervisor.html（AI 督导）功能

- 🔐 SHA-256 密码验证（明文不存源码）
- 📎 文件上传（.txt/.md/.docx，限 4000 字）
- 🔍 整体印象：核心议题→临床信号→初步假设→信息缺口→工作方向
- 💬 后续督导对话
- 📚 基于 alice-perspective SKILL.md 的完整督导框架
- 🔄 四层 API 降级（与聊天页一致）

---

## 四、API 路由架构

### 4.1 四层降级（winnicott-chat.html 第 845-849 行）

| 层级 | 名称 | 端点 | Key 尾号 | 模型名 |
|------|------|------|----------|--------|
| 1 | DeepSeek Pro | `api.kkdmx.com/v1` | `…e22DROJR` | `deepseek-ai/deepseek-v4-pro` |
| 2 | DeepSeek Flash | `api.kkdmx.com/v1` | `…wgmIIX21` | `deepseek-ai/deepseek-v4-flash` |
| 3 | MiniMax M3 | `api.kkdmx.com/v1` | `…fCxooKvD` | `minimaxai/minimax-m3` |
| 4 | Agnes | `apihub.agnes-ai.com/v1` | `…gqppC2e` | `agnes-2.0-flash` |

### 4.2 降级逻辑（关键变量）

```javascript
var _tierLevel = 0;  // 当前线路索引
```

- 每条消息尝试当前 `_tierLevel` 线路
- 失败则 `_tierLevel++`，尝试下一条
- 成功则保持当前线路，不再尝试
- **新对话/切换人物/加载历史/新对话** → 重置 `_tierLevel = 0`
- 超时 `_maxRetry` 次（最多3次）后切下一条

### 4.3 master-chat.html API 配置

位于第 506 行起的 `TIERS` 数组，结构相同。

---

## 五、知识库文件清单

### 已就绪 ✅

| 文件 | 大小 | 用途 | 来源 |
|------|------|------|------|
| `winnicott-knowledge.md` | 95KB | 温尼科特默认 | git 原版 |
| `winnicott-knowledge-full.md` | 179KB | 温尼科特高温度 | git 原版 |
| `winnicott-emotional.md` | 41KB | 温尼科特低温度 | git 原版 |
| `lacan-knowledge.md` | 15KB | 拉康全温度 | git 原版 |
| `freud-knowledge.md` | 5.4KB | 弗洛伊德 | Marvis skill → 提炼 |
| `klein-knowledge.md` | 7.1KB | 克莱因 | Marvis skill → 提炼 |
| `jung-knowledge.md` | 6.3KB | 荣格 | Marvis skill → 提炼 |
| `bion-knowledge.md` | 7.1KB | 比昂 | Marvis skill → 提炼 |
| `rogers-knowledge.md` | 6.8KB | 罗杰斯 | Marvis skill → 提炼 |
| `beck-knowledge.md` | 7.8KB | 贝克 | Marvis skill → 提炼 |
| `yalom-knowledge.md` | 7.0KB | 亚隆 | Marvis skill → 提炼 |

### Skill 源文件路径（更新 KB 时参考）

```
C:\Users\Administrator\AppData\Roaming\Tencent\Marvis\User\oAN1i2TkarGXJ5_iqPWv0-tIVJqI\skills\
├── sigmund-freud-perspective/SKILL.md
├── melanie-klein-perspective/SKILL.md
├── carl-jung-perspective/SKILL.md
├── wilfred-bion-perspective/SKILL.md
├── carl-rogers-perspective/SKILL.md
├── aaron-beck-perspective/SKILL.md
├── irvin-yalom-perspective/SKILL.md
└── market/alice-perspective/SKILL.md   ← AI 督导
```

---

## 六、修改指南

### 6.1 修改流程（严格遵守）

1. **从当前文件开始**，不要重新写
2. **每次只改一个功能**，改完 → 部署测试
3. **任何 HTML 文件修改前**先保存备份
4. **API/模型名**必须先用 curl 验证后再写到代码里
5. **修改完成后更新本文件**（末尾变更记录 + 相关章节）

### 6.2 部署命令（GitHub Pages）

**生产环境部署：** 所有修改完成后，执行以下命令推送即可。GitHub Pages 自动构建，1-2 分钟后生效。
更新后的页面在固定 URL：`https://mei-junhao.github.io/winnicott-chat/`

```bash
# 1. 提交改动
cd C:\Users\Administrator\WorkBuddy\2026-06-21-10-33-32\winnicott-chat
git add .
git commit -m "描述改了什么"

# 2. 推送 main 分支
git push origin main

# 3. 更新 gh-pages 分支（public/ 目录自动提取为 Pages 根目录）
git push origin $(git subtree split --prefix=public main):gh-pages --force
```

**说明：** 
- `main` 分支存储完整源码
- `gh-pages` 分支是 `public/` 目录的子树镜像，作为 GitHub Pages 部署源
- 推送后无需任何额外操作，GitHub Actions 自动部署
- **禁止再使用 CloudStudio 沙箱部署**——URL 不固定，无法增量更新

### 6.3 验证 API 可用性

```bash
# 验证模型列表
curl -s -H 'Authorization: Bearer <KEY>' 'https://api.kkdmx.com/v1/models' | python3 -c "import sys,json; [print(m['id']) for m in json.load(sys.stdin)['data']]"

# 验证聊天可用
curl -s -X POST 'https://api.kkdmx.com/v1/chat/completions' \
  -H 'Authorization: Bearer <KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"model":"<MODEL>","messages":[{"role":"user","content":"hi"}],"max_tokens":5}'
```

### 6.4 关键代码位置（winnicott-chat.html）

| 功能 | 行号范围 |
|------|---------|
| CSS 样式 | 7-449 |
| HTML 结构 | 450-818 |
| API 路由配置 | 844-849 |
| i18n 字典 | 854-931 |
| 人物配置 | 932-1007 |
| `togglePersona()` 人物切换 | 1008-1065 |
| `sendMessage()` 主发送逻辑 | 1574-1785 |
| `runHealthCheck()` 线路检测 | 1478-1499 |
| `saveToHistory()` 历史保存 | 1390-1414 |
| `resetConversation()` 新对话 | 1567-1572 |
| `forwardMessages()` 转发 | 1346-1388 |
| 章节分隔逻辑 | 1872-1886 |

---

## 七、已知问题

1. `index.html` 为 git 原版 v3.1，非主页入口（主页为 `master-select.html`）
2. Agnes 线路使用独立端点 `apihub.agnes-ai.com` 和额外 Key（sk-dggqbb…）
3. `index-dev.html` / `index-dev2.html` / `backup-*.html` — 开发备份可清理
4. AI 督导 docx 解析依赖外部 JSZip CDN

---

## 八、待办事项

- [x] 创建 7 个缺失的知识库文件（freud/jung/klein/bion/rogers/beck/yalom）
- [x] AI 督导页面（密码保护 + 整体印象 + 后续对话）
- [x] 大师真实照片（Wikipedia URL）
- [x] 主页设为 master-select.html
- [ ] 对话自动章节改为基于语义相似度
- [ ] 清理开发备份文件

---

## 九、变更记录

| 日期 | 变更内容 |
|------|---------|
| 2026-06-29 | 🚀 迁移到 GitHub Pages：`mei-junhao.github.io/winnicott-chat/`，URL 固定不再变 |
| 2026-06-29 | 部署生产环境到 0e49a31…（入口 master-select.html） |
| 2026-06-29 | 创建 7 个大师知识库文件（来源：Marvis skills 提炼） |
| 2026-06-29 | 创建 AI 督导页面 ai-supervisor.html（密码 MJH SHA-256） |
| 2026-06-29 | master-chat.html：删除"换大师"链接，返回指向 master-select |
| 2026-06-29 | winnicott-chat.html 保持 v4 原样不动 |
| 2026-06-29 | 架构确定：master-select 主页 → winnicott-chat 和 master-chat 同级 |
| 2026-06-29 | 从旧部署 5b86bd20fcdf… 恢复完整 v4 源码 |
| 2026-06-29 | 创建 PROJECT.md 项目手册 |
