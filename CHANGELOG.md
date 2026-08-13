# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.3.2] - 2026-08-14

### Fixed

- 修复 macOS 浅色 Obsidian 主题下窗口控制按钮背后的白色标题栏区域。
- 移除激活页签两侧由浅色主题伪元素产生的白色圆角阴影。
- 修复右上角侧栏切换按钮容器仍使用浅色背景的问题。

## [1.3.1] - 2026-08-14

### Fixed

- 外壳主题会同步到 Obsidian 新开的弹出窗口，并在窗口、布局或 CSS 变化后保持启用；关闭设置或卸载插件时会从所有已知窗口完整移除。
- 修复左右侧栏原生标题栏的浅色背景，以及 Gantt Calendar 右侧栏的白色选中项、全天区域和任务卡。
- 提升侧栏标题、中文字体与原生导航图标在深色外壳下的清晰度和一致性。

## [1.3.0] - 2026-08-13

### Added

- Knowledge OS 八个模块统一为网页式单页签路由，普通点击复用当前页签，Cmd/Ctrl+点击及中键显式新开页签。
- 全部 Knowledge OS View 接入 Obsidian 公开的页签历史状态，可通过返回／前进恢复模块筛选与上下文。
- 新增可即时开关的 Obsidian 外壳主题同步，统一标题栏、页签、侧栏、状态栏、菜单、提示与弹窗。
- 首次升级自动合并旧版本遗留的 Knowledge OS 页签，之后保留用户主动创建的多个工作台页签。

### Changed

- 笔记、Canvas、Base 与完整原生 Graph 默认在当前页签打开，保留原生返回路径。
- Gantt 切出时完整销毁嵌入视图，切回后恢复视图模式和当前日期。
- 修正浅色 Obsidian 主题下设置页、命令面板快捷键、页签图标与中文字体的对比度和继承色。
- 页签标题改为当前模块短名称，避免窄窗口中被截断。

## [1.2.2] - 2026-08-13

### Fixed

- 修复嵌入 Knowledge OS 后周视图内容超出可视区域却无法纵向滚动的问题。

## [1.2.1] - 2026-08-13

### Changed

- 将日、周、月、年与甘特视图切换放到 Knowledge OS 的 Gantt 标题旁。
- 将 Gantt Calendar 的原生导航、筛选、标签、新增、设置、同步和撤销操作提升到同一标题行，移除内容区内重复工具栏以扩大时间线空间。
- 嵌入式 Gantt Calendar 使用与 Dashboard、Projects 和 Analytics 一致的深色变量与组件外观。

### Fixed

- 修复年视图中 12 个月超出内容区后无法纵向滚动的问题。

## [1.2.0] - 2026-08-13

### Added

- Knowledge OS 左侧主导航新增与 Dashboard 平级的 Gantt 页面。
- 新增“打开甘特时间线”命令，在 Knowledge OS 内容区挂载 Gantt Calendar 的原生视图并保留两侧工作台框架。
- 未安装或未启用 Gantt Calendar 时显示明确提示，不创建替代页面或隐藏服务依赖。

### Changed

- 项目模板增加 Tasks 格式的开始日期和截止日期示例，创建后可直接进入甘特时间线。

## [1.1.0] - 2026-08-07

### Added

- Claudian `2.0.41` 兼容适配与真实 Agent 执行状态机。
- Agent Definitions、Runs、Outputs 的本地文件链路与人工验收流程。
- 基于真实 Wikilink、主题共现和 BFS 路径的 Graph 分析。
- 脱敏 Starter Vault、Agent Definitions、Canvas 与 Bases 示例。
- 冷启动目录初始化保护与发布校验流程。

### Changed

- Analytics 的 AI 成功率改为只统计真实 Agent 运行记录。
- 未完成控件统一显示明确的“开发中”状态。
- 仓库改为直接维护工程源码；安装 ZIP 移至 GitHub Releases。

## [1.0.0] - 2026-08-05

### Added

- 首个预览版本。
- Dashboard、Inbox、Knowledge、Graph、Projects、AI Agents 与 Analytics 页面。
- 本地全文检索、网页采集、项目管理和知识分析基础能力。

[1.3.2]: https://github.com/Greatkingcj/Knowledge-OS/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/Greatkingcj/Knowledge-OS/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Greatkingcj/Knowledge-OS/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/Greatkingcj/Knowledge-OS/compare/v1.2.1...v1.2.2
[1.2.0]: https://github.com/Greatkingcj/Knowledge-OS/compare/v1.1.0...v1.2.0
[1.2.1]: https://github.com/Greatkingcj/Knowledge-OS/compare/v1.2.0...v1.2.1
[1.1.0]: https://github.com/SnowMontain/Knowledge-OS/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/SnowMontain/Knowledge-OS/releases/tag/v1.0.0
