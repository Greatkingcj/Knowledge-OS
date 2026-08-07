# AI Knowledge OS for Obsidian

AI Knowledge OS 是一个面向个人知识管理、企业 AI 落地、项目管理和内容生产的本地优先 Obsidian 工作台。

它将 Obsidian Vault 中的 Markdown、Wikilink、标签、任务、Canvas、Bases 和原生 Graph 组织成统一的知识驾驶舱。

> 当前版本：`1.1.0 Preview`
>
> 这是预览版，不是 Obsidian 官方插件。建议先在测试 Vault 中安装并备份重要数据。

## 获取项目

- 工程源码：直接克隆本仓库；`main` 保存当前开发版本。
- 稳定版本：使用不可变的版本标签，例如 [`v1.1.0`](https://github.com/SnowMontain/Knowledge-OS/tree/v1.1.0)。
- 安装包：从 [GitHub Releases](https://github.com/SnowMontain/Knowledge-OS/releases) 下载，不再把 ZIP 提交到 `main`。

```bash
git clone https://github.com/SnowMontain/Knowledge-OS.git
cd Knowledge-OS
npm ci
npm run verify
```

## 仓库结构

```text
Knowledge-OS/
├── source.js              # 主要开发源码
├── main.js                # Obsidian 加载的构建产物
├── styles.css             # 界面样式
├── manifest.json          # Obsidian 插件清单
├── defuddle.js            # 网页正文解析依赖
├── starter-vault/         # 脱敏模板、Canvas、Bases 与 Agent Definitions
├── scripts/               # 发布元数据校验
├── versions.json          # 插件版本与最低 Obsidian 版本映射
└── CHANGELOG.md           # 版本变更记录
```

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
- 如需真实执行 Agent，请另行安装并启用 Claudian；当前已适配版本为 `2.0.41`

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

如果希望首次打开就具备模板、Base、Canvas 和说明页面，把 `starter-vault/` 中的内容复制到目标 Vault，再按“安装方式一”复制插件运行文件：

```text
你的 Vault/
├── .obsidian/
│   └── plugins/
│       └── ai-knowledge-os/
└── AI Knowledge OS/
    ├── 00-Inbox/
    ├── Agents/
    │   ├── Definitions/
    │   ├── Runs/
    │   ├── Outputs/
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
- Agent 定义、运行记录和待验收输出分别保存在 `Agents/Definitions`、`Agents/Runs` 与 `Agents/Outputs`。

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

### 真实 Agent 执行

- Agent 使用 `queued → running → waiting-review → success/failed/blocked` 状态机。
- “立即运行”和“交给 Claudian 深度处理”会通过兼容适配器自动创建 Claudian 会话并提交任务。
- Claudian 返回结果后保存到 `Agents/Outputs`，任务先进入“待验收”。
- 只有输出文件存在、内容不为空并由用户验收后，任务才会标记为成功。
- Analytics 的 AI 成功率只统计 `Agents/Runs` 中的真实任务记录；旧版 Inbox 任务模板不会计入。

### 真实 Graph 与建议关系

- Graph 主题节点保留现有视觉布局，但连线权重来自主题共现和实际 Wikilink。
- “查看路径”使用真实知识图的 BFS 路径，不再拼接固定主题文案。
- “隐藏关联”只作为建议展示，并明确给出共同邻居，绝不会冒充已经存在的链接。
- 今日新增连接通过链接快照差异计算。

### 仍在开发的控件

通知、表情、助手附件、`@` 上下文以及部分“查看全部”入口保留现有外观，点击会明确提示“开发中”，不会静默无响应或产生假数据。

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

确认已安装并启用 Claudian `2.0.41`。未安装、未启用或版本不兼容时，任务会记录为 `blocked`，不会伪装成成功。

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

安装 Node.js 20 或更高版本后运行：

```bash
npm ci
npm run build
npm run verify
```

修改 `source.js` 后必须重新构建 `main.js`。`npm run verify` 会检查 JavaScript 语法、版本号一致性、必要发布文件和构建产物是否同步。

## 版本管理

- 使用语义化版本 `MAJOR.MINOR.PATCH`。
- `manifest.json`、`package.json` 与 `versions.json` 必须保持一致。
- 每个发布版本对应不可变 Git 标签 `vX.Y.Z`。
- 版本变化记录在 [`CHANGELOG.md`](./CHANGELOG.md)。
- ZIP 只放在 GitHub Release 中；仓库分支直接维护可审查的工程文件。
- 贡献和发布步骤见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## 第三方许可

AI Knowledge OS 使用 [MIT License](./LICENSE)。

网页正文提取能力包含 Defuddle，其许可单独记录在 [`DEFUDDLE-LICENSE.txt`](./DEFUDDLE-LICENSE.txt)；分发插件时必须保留该文件。
