# 人类调度

电脑端 MVP：让 AI 收集、拆解、安排、提醒和监督你的工作。

## 启动

```powershell
npm install
npm start
```

开发检查：

```powershell
npm run check
```

打包 Windows 应用：

```powershell
npm run dist
```

打包便携版：

```powershell
npm run dist:portable
```

如果当前网络无法下载 electron-builder 的 Windows 工具，可以使用离线便携版脚本：

```powershell
npm run pack:offline
```

它直接复用本地 Electron 运行时，生成 `release/人类调度-portable/人类调度.exe`。

安装包和便携版会输出到 `release/`。应用使用 `assets/app-icon.ico` 作为 Windows 图标，托盘继续使用同源 PNG；提示音位于 `assets/notification.mp3`。

## 当前能力

- Electron 桌面窗口、系统托盘和全局快捷键；
- 本地 JSON 保存任务、对话和监督事件；
- 自然语言创建任务、完成任务、阻塞任务和查询下一项；
- OpenAI 风格 API 配置：Base URL、API Key、模型名称；
- AI 结构化动作解析与本地规则降级；
- 任务拆解、当前任务推荐、定时监督和桌面通知；
- 后台被动督促：系统通知、右下角会话气泡、托盘“立即弹出督促”；
- 多项目、任务状态、监督语气和工作时间设置。
- 独立提醒板块：支持一次性、每天和每周固定时间提醒。
- 任务列表支持搜索、状态筛选、手动改状态和二次确认删除；提醒支持启停、重复频率调整和删除。
- 每种监督语气拥有独立提示词，可分别编辑、保存或恢复默认。
- 支持导出/导入本地 JSON 备份；备份不包含 API Key，导入时保留当前 API Key。
- 设置中预留“请作者喝咖啡”支持入口，适合公开免费发布后配置赞助链接。

## 数据位置

任务数据保存在 Electron 的用户数据目录中的 `human-dispatch-state.json`。API Key 也保存在本机应用数据中，当前版本尚未实现云同步。导出的备份会主动移除 API Key，避免用户误把密钥带入公开文件。

## 项目结构

- `src/`：Electron 主进程、预加载脚本、主窗口和监管气泡；
- `assets/`：应用图标和提示音；
- `docs/`：产品设计文档；
- `design/source-art/`：Logo 与动画源图；
- `design/animations/`：已生成的循环动画及 QA 产物；
- `tools/pixel2motion/`：动画生成、导出和验证脚本；
- `release/`：打包输出目录，不纳入应用运行源码。

## 下一阶段

将本地存储抽象为同步服务接口，再增加手机端 API/账号层，实现电脑与手机共享任务、对话和监督事件。后台督促频率可在设置中调整，默认每 10 分钟一次，最低 5 分钟。
