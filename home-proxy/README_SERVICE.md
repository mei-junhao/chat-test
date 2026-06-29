# 本地代理自动运行与监控方案

## 约束
- 必须本地部署，电脑需保持开机。
- Key 不得暴露在前端或云端（Key 仅在本地环境变量中）。
- 进程被杀死后应自动重启。

## 方案

### 1. Windows 服务包装（推荐）
使用 `service_wrapper.ps1` 将 `proxy.py` 封装为 Windows 服务，实现开机自启与自动重启。

#### 安装
1. 确保已安装 Python，并将 Python 可执行路径改为实际路径（脚本中 `$PythonExe`）。
2. 设置环境变量行（`$EnvVarLine`）为你的 DeepSeek Key，例如：`set DEEPSEEK_API_KEY=sk-xxx`。
3. 以管理员运行 PowerShell，执行：
   ```
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\service_wrapper.ps1 install
   ```
4. 启动服务：
   ```
   Start-Service -Name WinnicottDeepSeekProxy
   ```

#### 验证
- 查看服务状态：`.\service_wrapper.ps1 status`
- 查看日志：`Get-Content "$PSScriptRoot\proxy.log" -Tail 20 -Wait`（建议在 proxy.py 中增加日志写入到文件）

#### 卸载
```
.\service_wrapper.ps1 uninstall
```

### 2. 备用：后台守护脚本（若无法安装服务）
在 `home-proxy` 目录下运行守护脚本（需保持 PowerShell 窗口或使用 tmux/screen）：
```
cd C:\Users\Administrator\WorkBuddy\2026-06-21-10-33-32\winnicott-chat\home-proxy
set DEEPSEEK_API_KEY=sk-xxx
while ($true) { python proxy.py; Start-Sleep -Seconds 5 }
```

### 3. 前端配置（无需更改）
前端仍使用当前代理端点（localhost:9000），因为服务监听在 `0.0.0.0:9000`。
若需切换为 SCF 稳定端点，请按此前文档更新 `PRIMARY_API`。

## 维护建议
- 将 Key 写入 Windows 凭条库或受保护的配置文件，避免明文存放。
- 定期查看服务日志，观察异常。
- 若升级 proxy.py，需重启服务：`Restart-Service -Name WinnicottDeepSeekProxy`
