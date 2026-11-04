# 功能说明图

![人类调度功能一览](humancall-feature-overview.png)

基于 v0.1.25 实际页面截图制作。主界面上叠加任务清单、消息提醒、语音回复、瞬笺、个人资料和日历；日历展示月视图及选中日期右侧的当天清单。

成品为 **6000 × 3600 像素的无损 PNG**。以三倍像素密度直接截取 Electron 页面，按原比例缩小排版；文字、图标、头像及日历均保留真实界面。标题、标注与引导线由浏览器直接渲染。

[打开高清原图](humancall-feature-overview.png?raw=true)。网页预览会随页面宽度缩小，查看细节可打开原图。

在可用的桌面会话中，安装依赖后运行：

```sh
npm run docs:overview
```

入口为 [截图生成脚本](../../tools/generate-feature-overview.cjs)，截屏与排版见 [渲染脚本](../../tools/render-feature-overview.cjs)。脚本使用独立临时数据目录，示例日期为 2026 年 11 月 4 日，聊天与任务均为演示内容。运行时校验日历日期、画布尺寸和截图缩放比例。不同系统的字体可能有差异。

只提交定稿；中间截图、排版页面与验证记录保存在已忽略的 `work/feature-overview-hd/`。
