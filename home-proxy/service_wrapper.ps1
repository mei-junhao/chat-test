# PowerShell 封装脚本：确保 proxy.py 持续运行
# 放在 winnicott-chat/home-proxy/service_wrapper.ps1
# 用法（管理员）：Set-ExecutionPolicy RemoteSigned -Scope CurrentUser；然后 .\service_wrapper.ps1 install

$ServiceName = "WinnicottDeepSeekProxy"
$ScriptPath = (Resolve-Path "$PSScriptRoot\proxy.py").Path
$PythonExe = "C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
$EnvVarLine = "set DEEPSEEK_API_KEY=sk-your-xxx"

if ($args[0] -eq "install") {
    if ((Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) -ne $null) {
        Write-Host "Service already exists. Removing..."
        sc.exe delete $ServiceName | Out-Null
    }
    # 构建启动命令：先进入目录、设环境变量、启动代理并输出日志
    $cmd = "& `"$PythonExe`" `"$ScriptPath`""
    $action = New-Service -Name $ServiceName `
        -BinaryPathName "powershell.exe -NoProfile -WindowStyle Hidden -Command `"$EnvVarLine; cd /d $PSScriptRoot; while (`$true) { & $cmd; Start-Sleep -Seconds 5 }`""
    Set-Service -Name $ServiceName -StartupType Automatic
    Write-Host "Service $ServiceName installed. Start it with: Start-Service -Name $ServiceName"
    exit
}

if ($args[0] -eq "uninstall") {
    if ((Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) -ne $null) {
        Stop-Service -Name $ServiceName -Force
        sc.exe delete $ServiceName | Out-Null
        Write-Host "Service $ServiceName removed."
    } else {
        Write-Host "Service not found."
    }
    exit
}

if ($args[0] -eq "status") {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Service $ServiceName status: $($svc.Status)"
    } else {
        Write-Host "Service $ServiceName not installed."
    }
    exit
}

Write-Host "Usage: .\service_wrapper.ps1 install | uninstall | status"
