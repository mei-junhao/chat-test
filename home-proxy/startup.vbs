' DeepSeek Home Proxy - 开机静默自启
' 放到启动文件夹: Win+R → shell:startup → 把此文件的快捷方式放进去

Dim shell
Set shell = CreateObject("WScript.Shell")

' 获取当前脚本所在目录
Dim scriptDir
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' 静默运行 startup.bat（不弹窗口）
shell.Run """" & scriptDir & "\startup.bat""", 0, False

Set shell = Nothing
