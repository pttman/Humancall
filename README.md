# 人类调度 · 前后端分离版

让 AI 帮你拆解工作、安排下一步、管理提醒并追踪进度。保留原有界面、主题、任务层级、对话和设置，同时提供独立网页前端、HTTP API 后端及 Electron 桌面版。

## 快速启动

使用 Node.js 20.12+，在项目根目录执行：

```powershell
npm install
npm run dev
```

打开 http://127.0.0.1:5173 。前端开发服务器将 `/api` 代理到 http://127.0.0.1:3001 。

也可在两个终端分别执行 `npm run dev:frontend` 与 `npm run dev:backend`。

启动桌面版：

```powershell
npm start
```

桌面版自动启动本地 API，保留系统托盘、自绘提醒气泡和原有用户数据目录。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `frontend/` | HTML/CSS/JavaScript 界面、HTTP API 客户端、开发代理 |
| `backend/` | Node.js API、数据持久化、模型接口、本地规则、API 测试 |
| `src/` | Electron 窗口、托盘和桌面功能适配 |
| `assets/` | 应用图标和提醒音频 |
| `tools/` | 开发启动、检查、桌面测试和打包 |
| `docs/` | 开发与产品说明 |

## 配置与数据

按需复制 `backend/.env.example` 为 `backend/.env`、`frontend/.env.example` 为 `frontend/.env`。支持 OpenAI 兼容模型接口，可在应用设置中配置，也可使用后端环境变量；未配置模型时使用本地规则。

网页模式数据默认写入 `backend/data/`；桌面版沿用 `%APPDATA%/human-dispatch` 或安装时选择的目录。备份导出不包含 API Key，导入保留当前密钥。模型请求会将相关对话和任务上下文发送给所配置的服务商。

网页版需要保持主页面打开才能执行到期提醒，浏览器通知需要授权。当前 API 面向本机单用户使用，默认仅监听回环地址。

完整配置、API、模式差异和数据迁移说明见 [前后端开发说明](docs/frontend-backend.md)。

## 验证与打包

```powershell
npm run check
npm test
npm run test:desktop
```

API 测试使用临时数据和模拟模型；桌面测试验证实际窗口、网页渲染及 HTTP 通信，不修改真实用户数据。

Windows 打包：`npm run pack`、`npm run dist`、`npm run dist:portable` 或 `npm run pack:offline`。既有 GitHub Release 是历史桌面版本，本次源码改造没有生成新安装包。

## 反馈与许可证

问题和建议请提交到 [GitHub Issues](https://github.com/pttman/Humancall/issues)。许可证见 [LICENSE](LICENSE)。
