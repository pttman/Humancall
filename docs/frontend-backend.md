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

## Agent 执行流程

配置密钥后，`POST /api/ai/chat` 默认使用 backend/agent.cjs 的工具循环。模型需支持 Chat Completions 的 tools/tool_calls；连接测试传入 settings 和 testAgent:true，运行工具但不提交测试修改。未配置密钥时保留本地规则。服务商不支持工具调用时返回明确错误，不把失败伪装成成功。

工具包括 set_plan、list_tasks、list_reminders、execute_actions、request_deletion 和 finish。任务 ID 来自实际查询或创建结果；每批写入先验证类型、枚举、引用和时间，再在草稿上执行。工具结果返回模型以便修正或继续，最多 8 轮、每轮 6 个工具，每批最多 12 个动作，整体 90 秒预算、单次请求最多 30 秒。只有 finish 才提交，失败和超预算不保存修改。

backend/actions.cjs 保留原任务层级、父任务状态汇总、自动下一项和完成后取消检查的语义。成功返回 applied:true 和 state，前端采用此状态，避免重复执行动作。执行期间暂停本窗口定时提醒写入及按钮操作；后端提交前比较任务、提醒、设置、监督记录等快照，若已变动返回 409，保留用户新数据。当前仍以单主窗口使用为主，不提供跨客户端事务锁或离线合并。

删除只返回确认请求，不在工具内删除。执行记录随对话保存，仅记录计划与工具摘要，不保存模型内部思考、密钥或完整模型请求。前端网络失败会恢复输入框。现有 settings 覆盖请求可继续使用旧结构化接口，以保持 API 兼容。

验证：npm test 包含多轮工具修正、非法动作批次回滚、新建 ID 后续引用、删除确认、HTTP 提交、模型失败和并发冲突。npm run test:desktop 使用模拟工具模型验证真实界面、无重复创建、执行记录及网络失败后的输入恢复，不调用真实付费模型。

## 上下文提醒与澄清问题（0.1.3）

backend/supervisor.cjs 统一桌面后台督促与网页定时检查，通过 POST /api/ai/check-in 调用 Agent 的只读 check_in 模式。该模式只开放查询、ask_question 和 finish；不会在后台修改、完成或删除任务。气泡文本和快捷回复来自模型，finish(silent:true) 可决定不打扰。静默时间、工作时间、被动提醒开关和频率仍由程序约束；进行中的已确认会议直接排除，临近会议优先。模型故障不产生固定催办文案，定时检查保留重试机会。

ask_question 将问题及 field、taskId、id 存到 agentContext.pendingQuestion。字段为 startsAt、durationMinutes 或 details（动作 description）；模型下一轮能读到这个状态，更新对应任务后清除已回答的问题。尚未建任务的问题可在用户回答并创建安排时解决。用户的“九点”与“一小时”由模型结合日期、时区和上下文解释，程序校验时间格式和时长，不凭关键词猜测日程。

任务可保存 kind=meeting/appointment、startsAt、durationMinutes；未知时间和未来会议不会自动进入执行中，界面显示待确认或具体开始时间。后台问题先进入主对话再显示气泡，气泡回传 {text,context:{taskId,questionId,body}}，旧字符串回复仍兼容；主窗口忙时回复排队。主窗口生成期间若任务或对话已更新，会丢弃过期提醒。原明确时间的生活闹钟、休息结束提示仍保留确定性到点通知。

验证新增 npm run test:conversation：模拟模型下验证实际 Electron 气泡提问、快捷回复、真实 IPC 回答、会议时间/时长持久化及资料补充；无真实模型额度消耗。npm run pack:offline 将本地运行目录生成到 release/人类调度-版本号-portable/，需保留该目录全部文件。

## DeepSeek 接入（0.1.4）

本应用需要支持 Chat Completions tools/tool_calls 的接口，不要求单独的 Agent 产品。DeepSeek 官方接口可用于这一流程。按照 2026-10-30 官方文档，可填写 Base URL https://api.deepseek.com、模型 deepseek-flash（或账号有权使用的 deepseek-v4-pro），并填入 API Key。模型名称以官方控制台和接口文档为准，不要填网页产品名称。

官方接口当前默认启用思考模式，该模式不允许 tool_choice:required。backend/model-client.cjs 针对主机 api.deepseek.com 使用 tool_choice:auto 和 thinking:{type:'disabled'}，并省略 parallel_tool_calls；其他兼容接口保留原协议。auto 模式直接返回文字时，Agent 会要求 finish 收尾，仍使用相同事务保护。模型返回的 reasoning_content 只在本轮请求内存中回传，不写入对话、执行记录或备份。

非 2xx 响应会提取服务商 error.message 并显示，过滤配置中的密钥、Bearer 值和常见密钥格式；无有效 JSON 时提供状态码提示。400 需要结合具体详情判断，可能是模型名、参数或工具格式问题；仅凭状态码不能确认 Key 有效与否。401/402/429 分别可检查鉴权、余额、限频。

官方参考：https://api-docs.deepseek.com/api/create-chat-completion/ 与 https://api-docs.deepseek.com/guides/thinking_mode/ 。新增协议回归测试不连接真实 DeepSeek，不消耗用户额度。

## 聊天窗口（0.1.5）

主窗口采用桌面聊天布局：左侧会话和聊天记录搜索，中间为消息气泡与独立输入区；任务、提醒、当前安排收纳在右侧清单。支持消息时间、复制、表情及常用语。Enter 发送，Shift + Enter 换行；中文输入法选词时的 Enter 不发送。清空聊天记录需确认，任务和提醒保留。

前端新增 chat.css，布局样式限定在 messenger-shell，不影响桌面提醒气泡。消息仍从原有 state.messages 读取，模型、API 和数据格式沿用，主窗口默认尺寸调整为 1220×820。现有设置入口和主题切换保留，窄屏隐藏会话列表并保持输入区可见。

npm run test:chat-ui 使用临时数据验证聊天搜索、侧栏开关、表情插入、发送键、输入法保护、空消息禁用、设置与窄屏布局，并生成真实窗口截图。可用 CHAT_PREVIEW_DIR 指定截图目录。预览中的对话是测试数据，不是用户聊天记录。

## Agent 表情工具（0.1.6）

新增 search_stickers（按 mood/animated 筛选）和 send_sticker（选择已查询的 id）。一轮最多一张，默认不连续两条回复发送；用户明确要求表情时可突破相邻消息限频，设置关闭后始终不发送。后台 check_in 模式同样可选择表情，但 silent:true 和删除确认不附图。工具仅选择呈现素材，不修改任务，也不代表任务完成。

frontend/stickers.js 是前后端共用的本地素材目录，backend/stickers.cjs 提供工具访问。8 张表情含 4 张 CSS 动画 SVG，每张动画都有独立静态备用文件；均为项目内生成的简单矢量图，不接外部图片地址。tools/generate-stickers.cjs 可重建素材。现有 CSP 保持同源限制，不因表情开放远程域名。

消息存储 sticker:{id}，模型请求可读取历史表情标签以减少重复；客户端只解析目录中的 id，不信任模型/导入备份提供的 URL。主聊天和桌面气泡均可呈现，未知 id 忽略、加载失败显示文字。动画暂停状态在当前页面重绘后保留，系统减少动态效果时使用静态版本。关闭开关只影响未来发送，历史消息保留。

npm test 覆盖筛选、素材存在、未知 id、单轮上限、发送频率、设置开关与静默。npm run test:stickers 使用模拟模型验证真实 HTTP/Agent/聊天/气泡链路、图片加载、截图帧差确认动画真实播放、暂停与系统减少动态效果偏好、消息保存，并生成素材预览；可用 STICKER_PREVIEW_DIR 指定截图目录。

可扩展的外部搜索服务参考 GIPHY：https://developers.giphy.com/docs/ （需 API Key 与来源标识）。本版不依赖外部表情 API。

## 联网动态表情（0.1.7）

search_stickers 默认 source=auto，优先检索 Google Noto Animated Emoji 的在线目录 https://googlefonts.github.io/noto-emoji-animation/data/api.json 。query 可由模型按语境生成简短关键词；支持基础中文情绪别名映射，但实际候选来自在线目录而非内置素材。目录内存缓存 5 分钟，HEAD 检查 GIF 类型和 4 MB 大小上限，通过后返回最多 6 个真实存在的候选。任务执行预算、相邻表情限频、静默和关闭开关保持生效。

图片由前端从 https://fonts.gstatic.com 直接加载，不将远程 GIF 文件打包或下载到用户数据目录。素材描述保存在消息中，用 noto:codepoint 标识。frontend/online-sticker.js 只根据合法编号构造固定官方域名和路径，忽略模型或备份传入的任意 URL；CSP 只额外允许该图片域名。每张图展示 Google Noto Emoji / CC BY 4.0 与原图入口。暂停/减少动态效果使用同一表情的官方 PNG。

onlineStickersEnabled 默认为 true；设为 false 或选择 source=local 时只查内置素材。关闭 stickersEnabled 时不做联网查询。服务失败明确返回 source=local/fallback:true，模型不得声称联网成功。API POST /api/stickers/search 接收 {query}，用于设置中的连接测试，无需调用付费模型。桌面版使用 Electron net.fetch 跟随系统网络/代理配置，独立后端使用 Node fetch。

公开库偏向简单动态 Emoji，非任意网站全网搜图，也非影视梗图搜索服务。本次未接入 GIPHY：其公开集成规则要求客户端搜索、禁止 API 代理和媒体缓存等，不能将它简单替换成后台代理接口。官方说明：https://googlefonts.github.io/noto-emoji-files/?view=docs 和 https://developers.giphy.com/docs/api/ 。

npm test 的在线模块测试使用注入的网络响应，验证地址约束、过滤、缓存、失败回退与 Agent 选图。npm run test:online-stickers 则实际连接公开目录和图片服务，仅模型推理模拟，验证真实网络 GIF、客户端动画帧差、暂停/减少动态偏好、来源署名、消息存储和气泡显示；需要外网连接。可用 ONLINE_STICKER_PREVIEW_DIR 指定预览输出目录。

## 活跃动图频率（0.1.8）

stickerFrequency 默认 lively，可选 balanced / quiet。lively 不再以“上一条带表情”为由拦截下一条不同表情；balanced 保留相邻消息间隔，quiet 降低到最近三条助手消息内的间隔。显式索要动图可突破频率间隔；用户选择纯文字或关闭 stickersEnabled 时仍不发。

新增 backend/sticker-policy.cjs 处理频率、近期三条消息去重和 Noto 肤色变体归并。用户明确要求重发同一张时才允许重复。手动工具选择和自动配图共用这一策略。

finish 新增 stickerMood（六种情绪及 none）和 stickerQuery，活跃模式向真实模型暴露的工具 schema 要求明确选择 mood。模型根据双方对话决定搜索意图，程序自动调用已有联网检索并选择匹配且未重复的动态候选，不依赖模型额外执行 search/send 两个工具；如果候选重复，可在同情绪下扩大一次检索。旧工具调用仍兼容。已有文字、任务和澄清结果优先，动图不可用不会回滚任务，剩余预算不足会先返回文字。none、静默、删除确认和 connection_test 跳过自动配图；连接测试不会为配图联网。

npm test 验证上下文传递、连续不同动图、近似重复过滤、频率/关闭开关、none、预算和失败后的任务结果保留。npm run test:lively-stickers 使用模拟模型与内置动画验证真实桌面连续三种情境自动配图、严肃场景留白、暂停、消息保存及设置入口，不产生真实模型或外部搜索费用。

## 柔和界面（0.1.9）

新增 frontend/soft-ui.css，在现有布局样式之后加载，统一主聊天、任务侧栏、设置窗口和提醒气泡的配色、圆角与阴影。默认使用奶白和低饱和鼠尾草绿；聊天区与输入框采用独立圆角容器，消息去掉尖角尾巴，头像和控件统一圆角尺度；侧栏作为柔和浮层展示。夜色和窄屏对应适配。主题标识和用户数据格式沿用，模型及任务行为未调整。

沿用 test:chat-ui 检查搜索、输入法、发送、侧栏、设置与窄窗口，并检查浅色/夜色截图；test:lively-stickers 验证动图与提醒气泡。测试使用临时数据和模拟模型。

## 模型预设与清单编辑（0.1.10）

设置内置 DeepSeek、阿里云中国内地通义千问、OpenAI 以及自定义兼容接口。地址与模型自动填写，支持高级自定义；不同服务的 Key 分别保存在本机，不随切换复制。导出会移除全部服务的 Key；导入只使用本机服务地址匹配的 Key。模型预设定义在 frontend/model-presets.js，旧设置按地址识别，不强制替换已存模型。

预设参考 [cc-switch](https://github.com/farion1231/cc-switch)、[DeepSeek 接入文档](https://api-docs.deepseek.com/quick_start/agent_integrations/)、[千问工具调用文档](https://help.aliyun.com/en/model-studio/qwen-function-calling)、[OpenAI 模型文档](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。千问使用 auto 工具选择并关闭思考，避免 required 参数不兼容。

任务编辑复用添加表单，保持 ID、层级与历史消息；时间按本机时区显示，保存为 ISO。dueAtIsDeadline=true 表示截止时间与 deferredUntil（静默 / 延期）独立；旧数据的 dueAt 在没有该标志时保留原来的延期语义，编辑时显示在静默字段。共用 frontend/task-schedule.js 保持前端、后端执行器和监督器的一致性。修改时间会撤销旧的未发送监督事件。清空按钮在 5 秒内再次点击直接执行，不写入对话；确认期间任务集合变化会重新确认。

## 微信界面与中文表情包（0.1.11）

frontend/wechat.css 恢复灰白聊天区、绿色用户气泡、深灰导航和小圆角，移除柔和浮层配色。soft-ui.css 仅保留 0.1.10 的表单 / 任务交互布局，主题 ID 沿用旧数据。

backend/online-stickers.cjs 访问 [ChineseBQB 完整图片索引](https://zhaoolee.com/ChineseBQB/catalog/search.json)，依据中文文件标签和分类检索；英文情绪词映射到中文，动态优先，同语义优先于静态 / 动态偏好，不再从 Noto 搜索新图。过滤 Emoji 分类与无效 / 过大媒体；HEAD 验证图片类型及体积，目录缓存 10 分钟。检索只发送情绪关键词，不把对话或 API Key 放入请求。图片版权仍归各原作者；来源链接指向收录仓库，不将收录项目误标为图片授权方。

在线 ID 使用 chinesebqb:哈希.扩展名。前后端从固定源及合法哈希重建图片 / 静态缩略图地址，忽略传入 URL。CSP 只新增 zhaoolee.com；旧 Noto ID 仅为历史记录兼容。Agent 的 send_sticker 仍须先搜索并从候选中选择；自动配图可采用贴切的静态中文图。聊天图片限制为 96×96、气泡为 72×72，保持内容比例，来源默认折叠。提醒窗口使用 ResizeObserver 跟随图片加载后的实际高度。

验证：npm test 覆盖中文检索、错误路径 / 大图过滤、缓存、静态回退、旧记录解析和 Agent 候选发送。npm run test:online-stickers 使用模拟模型和真实中文目录 / GIF 检查图片加载、像素动画变化、暂停 / 减少动态偏好、尺寸、气泡与保存；模型无真实额度消耗。npm run test:chat-ui 增加微信配色与零圆角聊天容器断言，沿用窄屏 / 夜色回归；npm run test:task-settings 验证上一轮设置和清单操作。

## 全库检索与清单展示（0.1.12）

中文表情包检索移除角色、题材、画风与分类筛选，不再排除特定标签。Agent 工具说明及系统提示统一为 ChineseBQB 整库检索；关键词别名仍用于提高匹配率，不限定分类。保留媒体路径、格式、体积、连通性校验及联网开关。

任务抽屉桌面宽度改为 430–600px，窄屏占满工作区；每行任务采用内容区和操作区两行结构。标题 / 说明最多显示两行，保留完整文字供悬停与编辑查看；时间与项目等信息分项排列，操作按钮不再占用标题宽度。点击标题、行尾“编辑任务”或当前调度的编辑入口均可打开原任务。已完成、已取消、子任务与总任务可修改内容及时间；总任务状态仍由子任务汇总。内容编辑保留任务 ID、创建时间和已有完成时间。筛选“已完成”会展开相应任务，避免被折叠状态挡住。

验证：npm run test:task-list 在临时用户目录中测试已保存任务的编辑、完成 / 取消 / 子任务状态、创建时间与完成时间保留、添加后重载再编辑、当前任务入口及桌面 / 窄屏布局；npm test 覆盖跨分类检索及原有后端功能。

## 追问生命周期与独立表情消息（0.1.13）

frontend/conversation-state.js 由界面、持久化层、执行器和监督器共同使用。读取旧数据时移除无归属的遗留问题；绑定到已完成 / 取消 / 删除任务或停用提醒的问题失效。用户当前新安排可在建任务前通过 requestQuote 创建 scope=new_request 澄清，最多跨一次用户回复；之后由本轮回答消费或新问题替换。ask_question 不允许追问关闭事项，后台只能针对当前目标任务提问。list_reminders 默认返回启用项，查询历史需 includeDisabled=true。普通问答先回答最新话题，不自动恢复已结束提醒。

完成、取消和删除后移除未发送的任务事件；状态保存广播 bubble:prune，同步撤下失效催问卡片并检查排队 / 迟到气泡。空清单在前端和后端均直接静默，不调用模型。生成期间状态已变动的结果不会落入消息或弹窗；独立休息提醒不受任务清理影响。

新回复的文字记录与 kind=sticker 记录分别保存，表情用 replyToId 指向前一条文字，不产生空文字气泡，执行过程保存在文字消息上。历史合并消息仍可显示；频率和去重按回复轮次统计。新配图会将本轮用户消息、完整最终回答和最多 6 个候选标签送给当前已配置模型，通过独立 choose_sticker 调用复核，允许 none；不限制中文表情库题材，语义匹配优先于动画。请求失败或无贴切候选仅省略表情，已执行任务和文字照常保留；每次成功复核会使用同一模型接口额外发起一次短请求，12 秒上限且服从原 90 秒预算。减少动态效果、暂停、来源和尺寸限制继续生效。

验证：npm test 新增外卖旧数据迁移、空清单 / 强制检查静默、关闭事项硬约束、合法新澄清、普通话题切换、候选按回答复核和独立消息计频；npm run test:conversation-lifecycle 重现旧外卖追问，检查普通问答、旧气泡清理及生成竞态；npm run test:lively-stickers 检查两条消息、文字执行记录、连续配图和重载关联。所有测试使用临时用户数据及模拟模型，不使用用户密钥。

## 安装版发布（0.1.14）

Windows 默认构建目标为 NSIS 安装程序，使用 npm run dist:installer 生成 Humancall-Setup-0.1.14-x64.exe；构建不会自动上传。GitHub Release 仅提供安装程序和校验文件，安装向导支持选择安装目录、数据保存目录并创建快捷方式。

0.1.14 将清空聊天改为应用内确认并恢复输入焦点，调整正文及辅助文字的对比度，增加“知序”和用户的默认头像、名称与本地图像自定义。头像在本机裁剪和保存，仅将显示名称用于模型称呼。按用户要求，本次发布没有重新运行最终回归测试。
