# AI Knowledge OS for Obsidian

AI Knowledge OS 是一个面向个人知识管理、企业 AI 落地、项目管理和内容生产的本地优先 Obsidian 工作台。

它将 Obsidian Vault 中的 Markdown、Wikilink、标签、任务、Canvas、Bases 和原生 Graph 组织成统一的知识驾驶舱。

> 当前版本：`1.0.0 Preview`
>
> 这是预览版，不是 Obsidian 官方插件。建议先在测试 Vault 中安装并备份重要数据。

## 主要页面

- Dashboard：知识统计、最近笔记、今日洞察与本地知识检索
- Inbox：快速记录、网页采集、文件导入、分类、标签和归档
- Knowledge：知识领域、收藏、标签、知识集合与原生关系图谱
- Graph：主题节点、知识路径和关联概览
- Projects：项目进度、任务、里程碑、关联知识和周报
- AI Agents：智能体模板、运行任务和执行记录
- Analytics：知识增长、链接、标签、知识价值和结构缺口分析

## 环境要求

- 桌面版 Obsidian
- 推荐 Obsidian `1.13.4` 或更高版本
- 插件清单声明的最低版本为 `1.8.0`
- 建议启用 Obsidian 核心插件：Graph、Canvas、Bases、File Explorer
- 如需使用 Claudian 交接功能，请另行安装 Claudian；当前开发环境使用 `2.0.41`

网页采集需要网络连接。语音输入依赖系统和 Obsidian 内置浏览器是否支持语音识别。

## 安装方式一：只安装插件

将插件文件夹复制到目标 Vault：

```text
你的 Vault/
└── .obsidian/
    └── plugins/
        └── ai-knowledge-os/
            ├── manifest.json
            ├── main.js
            ├── styles.css
            ├── README.md
            └── DEFUDDLE-LICENSE.txt
```

然后：

1. 打开 Obsidian 设置。
2. 进入“第三方插件”。
3. 如有需要，关闭安全模式。
4. 启用 `AI Knowledge OS`。
5. 通过左侧 Ribbon 图标或命令面板打开工作台。

`source.js` 和独立的 `defuddle.js` 用于开发，不是运行插件的必需文件；网页解析代码已经打包到 `main.js` 中。

## 安装方式二：安装完整体验包

如果希望首次打开就具备模板、Base、Canvas 和说明页面，还需要将脱敏后的 `AI Knowledge OS` 文件夹复制到 Vault 根目录：

```text
你的 Vault/
├── .obsidian/
│   └── plugins/
│       └── ai-knowledge-os/
└── AI Knowledge OS/
    ├── 00-Inbox/
    ├── Agents/
    │   └── Agent Center.md
    ├── Analytics/
    │   └── Knowledge Analytics.md
    ├── Knowledge/
    │   └── Knowledge.base
    ├── Projects/
    │   └── Projects.base
    ├── Templates/
    ├── Knowledge Map.canvas
    └── README.md
```

插件目前使用固定根目录名称：

```text
AI Knowledge OS
```

请不要修改该目录名称，否则模板、项目 Base、Canvas、报告输出和部分详情按钮可能无法找到目标。

## 数据如何工作

- 所有笔记、标签、任务和报告保存在本地 Vault。
- Dashboard、Knowledge、Graph 和 Analytics 会读取接收方整个 Vault，而不只读取 `AI Knowledge OS` 文件夹。
- 笔记数量、链接数、图谱、分类和推荐结果会根据每个人的 Vault 自动变化。
- Inbox 内容默认保存在 `AI Knowledge OS/00-Inbox`。
- 已整理知识默认移动到 `AI Knowledge OS/Knowledge`。
- 项目和分析报告分别保存在 `Projects` 与 `Analytics` 目录。

因此，安装插件可以还原界面与工作流，但不会复制原作者的私人知识和统计结果。

## AI 与本地规则的边界

当前版本包含三类能力：

### 已实现的本地功能

- Vault 数据统计和本地全文检索
- Wikilink、标签和任务分析
- Inbox 笔记创建、网页采集、上传、归档和删除
- 项目任务勾选、进度更新和周报生成
- 原生 Obsidian Graph 嵌入
- Markdown、Canvas 和 Bases 跳转

### 本地规则分析

以下能力使用关键词、正则表达式或统计公式，不会调用大模型：

- Inbox 自动分类与标签建议
- 快速摘要
- 知识领域识别
- 项目风险提示
- 知识价值排序和结构缺口分析
- Graph 主题聚类与节点摘要

### 预览或半自动功能

- Agent“立即运行”目前创建任务模板，不会自动执行模型或工具。
- Agent 状态、成功率和部分工具集成仍处于预览阶段。
- Graph 主页面的语义节点和主题连线包含预设结构，不等同于完整的真实 Wikilink 图谱。
- Claudian 按钮会打开 Claudian 并复制任务提示词，仍需用户确认和发送。
- 部分筛选、通知、成员邀请和“查看全部”入口尚未完成。

请勿将上述预览功能用于需要无人值守执行或严格审计的业务流程。

## 网页采集说明

网页采集使用 Obsidian 网络请求与 Defuddle 内容提取器，将网页正文转换为 Markdown。

以下情况可能导致正文提取不完整：

- 页面要求登录、验证码或特定 Cookie
- 网站禁止自动访问
- 内容依赖复杂的客户端脚本加载
- 地区、网络或反爬策略限制
- 视频、互动页面或非标准文档结构

解析失败时，插件会保留原始链接和错误信息，避免丢失采集入口。

## 隐私与分发安全

制作分享包时，不要直接发送整个个人 Vault 或完整 `.obsidian` 目录。

分发前请删除或脱敏：

- 客户名称、沟通记录和项目材料
- 私人笔记、联系人和附件
- API Key、登录信息和 Cookie
- Obsidian Sync 配置
- Claudian、飞书及其他插件的 `data.json`
- `.obsidian/workspace.json`、缓存和历史状态
- `.trash` 与本地备份

推荐只分发：

1. `AI-Knowledge-OS-Plugin.zip`：插件运行文件。
2. `AI-Knowledge-OS-Starter-Vault.zip`：脱敏模板、Base、Canvas 和少量演示笔记。

## 常见问题

### 启用插件后没有内容

插件会读取现有 Vault。空 Vault 中统计值较少属于正常现象。安装完整体验包或添加自己的 Markdown 笔记后即可看到数据。

### 点击模板、项目设置或 Canvas 提示找不到文件

确认 Vault 根目录中存在名称完全一致的 `AI Knowledge OS` 文件夹，并安装完整体验包。

### AI 按钮没有打开 Claudian

确认已安装并启用 Claudian。未检测到 Claudian 时，部分功能只会把提示词复制到剪贴板。

### 网页链接只能保存地址，无法保存正文

目标网站可能要求登录、验证码或脚本渲染。可在浏览器中打开网页后手动复制正文，或稍后重试。

### Windows 上字体与截图不完全一致

插件优先使用 Inter、HarmonyOS Sans SC、PingFang SC 和 Microsoft YaHei。不同系统会选择不同的可用字体，因此字形和间距可能略有差异。

### 移动端能否使用

基础页面可能可以加载，但 Claudian、原生 Graph 嵌入、网页采集和部分浏览器能力无法保证。完整体验建议使用桌面版。

## 卸载

1. 在 Obsidian 设置中禁用 `AI Knowledge OS`。
2. 删除 `.obsidian/plugins/ai-knowledge-os` 文件夹。
3. 如不再需要数据，可自行删除 Vault 根目录中的 `AI Knowledge OS` 文件夹。

删除插件不会自动删除知识文件。删除 `AI Knowledge OS` 数据目录前请先备份。

## 开发文件

- `source.js`：插件源代码
- `main.js`：Obsidian 实际加载的构建文件
- `styles.css`：界面样式
- `manifest.json`：插件清单
- `defuddle.js`：网页正文提取器开发依赖
- `DEFUDDLE-LICENSE.txt`：Defuddle 开源许可

修改 `source.js` 后需要重新构建 `main.js`，仅修改源文件不会影响 Obsidian 当前加载的插件。

## 第三方许可

网页正文提取能力包含 Defuddle。分发插件时请保留 `DEFUDDLE-LICENSE.txt`。

