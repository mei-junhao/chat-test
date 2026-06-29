# DeepSeek Home Proxy - 开机自启设置

## 方法一：启动文件夹（推荐）

1. 按 `Win + R`，输入 `shell:startup`，回车
2. 在打开的文件夹里右键 → 新建快捷方式
3. 浏览选 `startup.vbs`，完成
4. 双击测试一次，看看 `proxy.log` 有没有日志

## 方法二：任务计划程序（更可靠）

1. 按 `Win + R`，输入 `taskschd.msc`，回车
2. 右侧点"创建基本任务"
3. 名称：`DeepSeek Home Proxy`
4. 触发器：计算机启动时
5. 操作：启动程序 → `wscript.exe`
6. 参数：`startup.vbs` 的完整路径
7. 完成

## 验证

启动后打开浏览器访问：
http://localhost:9000

应该显示 `OK - DeepSeek Proxy Running`

隧道 URL 在 `cloudflared` 窗口里看。
