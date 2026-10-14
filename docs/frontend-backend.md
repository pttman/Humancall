# 前后端分离开发说明

要求 Node.js 20.12+（本次验证使用 Node.js 24），桌面运行还需安装根目录的 Electron 依赖。

## 启动

在项目根目录执行：

```powershell
npm install
npm run dev
```

访问 http://127.0.0.1:5173 。也可分别运行 `npm run dev:backend` 和 `npm run dev:frontend`，或进入对应目录执行 `npm start`。后端默认监听 127.0.0.1:3001，前端开发服务器将 `/api` 请求代理给后端；浏览器不直接调用模型服务。

`npm start` 启动 Electron 桌面版，自动在随机本地端口启动后端并加载前端，保留托盘、自绘提醒气泡、音频和原有数据目录选择逻辑。无需同时运行开发服务器。`npm run pack`、`npm run dist`、`npm run dist:portable` 和 `npm run pack:offline` 已包含新工程。

## 工程职责

- `frontend/`：原 HTML/CSS/界面脚本，`api.js` 提供 HTTP 客户端和浏览器功能适配；桌面专属功能仍通过 preload 调用。
- `backend/`：独立 Node.js HTTP 服务；`core.cjs` 承载原有状态、默认提示词、模型调用和本地规则。无需第三方运行时依赖。
- `src/`：Electron 桌面窗口、托盘、气泡及本地数据目录迁移。
- `tools/`：开发启动、语法检查、打包工具。

任务编辑和到期检查仍使用原界面逻辑，持久化与 AI 推理由后端执行。网页版需要保持主页面打开才能执行到期检查；浏览器通知需要授权。网页版不会自动创建桌面悬浮窗，可手动打开 `/bubble.html` 配合主页面回复；桌面版保留自动气泡和后台督促。多个主页面共享同一数据文件，请保持一个主页面，避免覆盖彼此的状态。

## 环境变量与数据

复制 `backend/.env.example` 为 `backend/.env`，复制 `frontend/.env.example` 为 `frontend/.env` 后按需调整；环境变量优先于文件配置。

后端：`HOST`、`PORT`、`FRONTEND_ORIGIN`、`DATA_DIR`、`MODEL_API_KEY`、`MODEL_BASE_URL`、`MODEL_NAME`。前端：`FRONTEND_PORT`、`API_PROXY_TARGET`。调整前端端口时同步修改后端允许的来源。

网页模式默认保存到 `backend/data/human-dispatch-state.json`；相对 DATA_DIR 以 backend 目录为基准。桌面版沿用 `%APPDATA%/human-dispatch` 或安装时所选的数据目录，不自动覆盖旧数据。可使用界面导出/导入在两种模式之间迁移，备份不会包含 API Key。界面保存的密钥仍保存在本机状态文件；环境变量密钥仅在后端模型请求时使用。API 是单用户本机服务，默认只绑定回环地址；尚未实现账号认证或远程部署权限管理。

## API

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| GET | /api/health | 健康检查 |
| GET / PUT | /api/state | 读取 / 保存完整状态 |
| GET | /api/settings/prompts | 默认及语气提示词 |
| POST | /api/ai/chat | `{text, messages, settings?}`，返回 reply/actions/source，失败自动降级本地规则 |
| GET / POST | /api/backup | 导出 / 导入，导入保留当前密钥 |

JSON 请求上限 2 MB；错误返回 `{error}` 和 HTTP 状态码。允许同源及 FRONTEND_ORIGIN 来源，支持 OPTIONS。后端还可直接提供前端静态页面。模型调用超时后降级；未配置模型也可使用本地规则。

## 验证

```powershell
npm run check
npm test
```

测试使用临时数据目录与模拟模型接口，覆盖持久化、备份密钥处理、提醒规则、模型上下文、格式校验、来源限制及页面资源，不修改真实用户数据，不消耗模型额度。

运行 npm run test:desktop 可验证实际 Electron 窗口和无 preload 的网页模式，包括界面渲染、HTTP 保存及对话调度。测试使用临时用户目录；如 Windows 缓存文件占用导致目录残留，可在退出后清理系统临时目录中 human-dispatch-ui- 前缀的测试目录。安装版和便携版可从 GitHub Release 下载。

## 更改数据保存位置

设置中点击更改保存位置：桌面版打开文件夹选择器，网页模式输入后端机器的绝对路径。现有数据复制到新位置并立即生效，旧文件保留；目标已有状态文件时拒绝覆盖。目录选择持久化，重启沿用。网页版目录记录保存在 backend/data-directory.txt（优先于 DATA_DIR），桌面版使用原用户数据目录的 data-directory.txt。GET /api/storage 读取当前目录，PUT /api/storage 接收 {directory}。
