---
title: AI Knowledge OS
aliases:
  - Obsidian AI 工作台
tags:
  - system/knowledge-os
cssclasses:
  - ai-knowledge-os-note
---

# AI Knowledge OS

> [!success] 工作台已就绪
> 这是连接本地知识、AI Agent 与项目工作流的个人知识操作系统。点击左侧边栏的紫色大脑图标，或运行命令 **AI Knowledge OS：打开知识驾驶舱**。

## 快速入口

| 工作区 | 用途 |
| --- | --- |
| [[AI Knowledge OS/Dashboard\|知识驾驶舱]] | 原生 Markdown 备用首页 |
| [[AI Knowledge OS/Knowledge/知识中心\|知识中心]] | 领域知识与核心概念 |
| [[AI Knowledge OS/Knowledge Map.canvas\|知识地图]] | Canvas 思维模式 |
| [[AI Knowledge OS/Projects/Projects.base\|项目管理]] | 项目数据库 |
| [[AI Knowledge OS/Agents/Agent Center\|Agent Center]] | AI 员工与提示词入口 |
| [[AI Knowledge OS/Analytics/Knowledge Analytics\|知识分析]] | 知识库健康度与复盘 |

## 推荐工作流

```mermaid
flowchart LR
    A[收集到 Inbox] --> B[整理为知识]
    B --> C[连接到项目]
    C --> D[交给 AI Agent]
    D --> E[形成内容或交付物]
    E --> F[复盘并回写知识库]
```

## 文件夹语义

- `00-Inbox`：尚未判断归属的信息。
- `Knowledge`：可复用的概念、案例、方法和方案。
- `Projects`：有目标、进度与下一步的工作。
- `Agents`：AI 角色、输入要求与输出标准。
- `Analytics`：知识增长与系统健康度复盘。
- `Templates`：新建笔记、项目和内容时的标准结构。
