const {
  ItemView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  htmlToMarkdown,
  normalizePath,
  requestUrl,
  setIcon,
} = require("obsidian");
const Defuddle = require("./defuddle.js");

const VIEW_TYPE = "ai-knowledge-os-dashboard";
const INBOX_VIEW_TYPE = "ai-knowledge-os-inbox";
const KNOWLEDGE_VIEW_TYPE = "ai-knowledge-os-knowledge";
const GRAPH_VIEW_TYPE = "ai-knowledge-os-graph";
const PROJECT_VIEW_TYPE = "ai-knowledge-os-projects";
const AGENT_VIEW_TYPE = "ai-knowledge-os-agents";
const ANALYTICS_VIEW_TYPE = "ai-knowledge-os-analytics";
const CLAUDIAN_VIEW_TYPE = "claudian-view";
const ROOT = "AI Knowledge OS";

const FEATURE_STATUS = Object.freeze({
  IMPLEMENTED: "implemented",
  PLANNED: "planned",
  UNAVAILABLE: "unavailable",
});

const FEATURES = Object.freeze({
  notificationCenter: { status: FEATURE_STATUS.PLANNED, label: "通知中心" },
  emojiPicker: { status: FEATURE_STATUS.PLANNED, label: "表情选择" },
  assistantAttachment: { status: FEATURE_STATUS.PLANNED, label: "添加附件" },
  assistantMention: { status: FEATURE_STATUS.PLANNED, label: "添加上下文" },
  viewAllAgents: { status: FEATURE_STATUS.PLANNED, label: "查看全部 Agents" },
  viewAllExecutions: { status: FEATURE_STATUS.PLANNED, label: "查看全部执行记录" },
  viewAllProjects: { status: FEATURE_STATUS.PLANNED, label: "查看全部项目精选" },
});

const AGENT_RUN_STATUSES = Object.freeze({
  DRAFT: "draft",
  QUEUED: "queued",
  RUNNING: "running",
  WAITING_REVIEW: "waiting-review",
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "cancelled",
  BLOCKED: "blocked",
});

const AGENT_STATUS_TRANSITIONS = Object.freeze({
  draft: new Set(["queued", "cancelled"]),
  queued: new Set(["running", "blocked", "cancelled"]),
  running: new Set(["waiting-review", "failed", "blocked", "cancelled"]),
  "waiting-review": new Set(["success", "failed", "cancelled"]),
  success: new Set(),
  failed: new Set(["queued"]),
  blocked: new Set(["queued", "cancelled"]),
  cancelled: new Set(["queued"]),
});

const CLAUDIAN_COMPAT = Object.freeze({
  "2.0.41": "internal-v1",
});

const DEFAULT_SETTINGS = {
  userName: "Ethan",
  openOnStartup: true,
  immersiveMode: true,
  graphSnapshot: null,
  graphDefaultDepth: 2,
};

const AGENT_DEFINITIONS = [
  { id: "content", name: "内容运营 Agent", icon: "newspaper", color: "purple", description: "从知识库生成文章、提案与内容草稿，并保留来源。", trigger: "按需运行", output: "文章 / 脚本", pattern: /(内容|文章|公众号|短视频|素材)/i },
  { id: "business", name: "商业分析 Agent", icon: "panel-top", color: "blue", description: "分析客户资料、业务场景、采购阻力与企业落地路径。", trigger: "手动触发", output: "分析报告", pattern: /(客户|商业|企业|需求|案例)/i },
  { id: "learning", name: "学习研究 Agent", icon: "graduation-cap", color: "teal", description: "总结论文与课程，提炼概念、证据、反例和适用边界。", trigger: "手动触发", output: "学习卡片", pattern: /(学习|论文|课程|研究|资料)/i },
  { id: "customer", name: "客户调研 Agent", icon: "target", color: "orange", description: "整理访谈与反馈，生成客户画像、洞察和追踪问题。", trigger: "按需运行", output: "调研洞察", pattern: /(客户|访谈|调研|反馈|画像)/i },
  { id: "project", name: "项目助理 Agent", icon: "briefcase-business", color: "blue", description: "跟踪里程碑和任务，生成项目周报并识别交付风险。", trigger: "项目更新后", output: "周报 / 风险", pattern: /(项目|交付|任务|里程碑|进度)/i },
  { id: "organizer", name: "知识库整理 Agent", icon: "bot", color: "purple", description: "清理、归类、去重并为知识建立标签和双向链接。", trigger: "按需运行", output: "知识卡片", pattern: /(知识库|笔记|标签|链接|整理)/i },
];

function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatSize(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatRelativeTime(timestamp) {
  const delta = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "刚刚";
  if (delta < hour) return `${Math.floor(delta / minute)} 分钟前`;
  if (delta < day) return `${Math.floor(delta / hour)} 小时前`;
  if (delta < day * 2) return "昨天";
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "Good Morning";
  if (hour < 18) return "Good Afternoon";
  return "Good Evening";
}

function cleanMarkdown(text) {
  return (text || "")
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[\[[^\]]+\]\]/g, "")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, "$2$1")
    .replace(/[#>*_=`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeName(input) {
  return (input || "未命名")
    .replace(/[\\/:*?"<>|#^\[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ""));
}

function getMetaContent(doc, selectors) {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeWebMarkdown(markdown) {
  return (markdown || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function textExcerpt(text, maxLength = 220) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).replace(/[，。！？；：,.!?;:]?$/, "")}…`;
}

function requestHeadersToObject(headers) {
  if (!headers) return {};
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

async function defuddleFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url;
  if (!url) throw new Error("异步正文接口缺少 URL");
  const response = await requestUrl({
    url,
    method: init.method || "GET",
    headers: requestHeadersToObject(init.headers),
    body: typeof init.body === "string" ? init.body : undefined,
    throw: false,
  });
  return new Response(response.arrayBuffer, {
    status: response.status,
    headers: response.headers,
  });
}

async function requestWebHtml(url, userAgent) {
  const response = await requestUrl({
    url,
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
      "Cache-Control": "no-cache",
      "User-Agent": userAgent,
    },
  });
  if (response.status >= 400) throw new Error(`网页返回 HTTP ${response.status}`);
  return response.text;
}

async function parseWebDocument(html, url) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc?.documentElement || doc.querySelector("parsererror")) {
    throw new Error("网页返回的 HTML 无法解析");
  }

  let parsed = null;
  try {
    const extractor = new Defuddle(doc.cloneNode(true), {
      url,
      removeImages: false,
      removeSmallImages: false,
      useAsync: true,
      fetch: defuddleFetch,
    });
    parsed = await extractor.parseAsync();
  } catch (error) {
    console.warn("AI Knowledge OS: Defuddle extraction failed, using DOM fallback", error);
  }

  const title = parsed?.title?.trim()
    || getMetaContent(doc, [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'meta[name="title"]',
    ])
    || doc.querySelector("#activity-name")?.textContent?.trim()
    || doc.querySelector("h1")?.textContent?.trim()
    || doc.querySelector("title")?.textContent?.trim()
    || new URL(url).hostname;

  const description = parsed?.description?.trim()
    || getMetaContent(doc, [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]);

  let contentHtml = parsed?.content || "";
  if (!contentHtml || (parsed?.wordCount || 0) < 8) {
    const fallback = doc.querySelector([
      "#js_content",
      "#article-content",
      "[itemprop='articleBody']",
      ".rich_media_content",
      ".article-content",
      ".post-content",
      ".entry-content",
      ".markdown-body",
      "article",
      "main",
    ].join(","));
    contentHtml = fallback?.outerHTML || contentHtml;
  }

  const markdown = normalizeWebMarkdown(contentHtml ? htmlToMarkdown(contentHtml) : "");
  const plainText = (parsed?.content || contentHtml)
    ? new DOMParser().parseFromString(`<body>${parsed?.content || contentHtml}</body>`, "text/html").body?.textContent?.trim() || ""
    : "";

  if (plainText.replace(/\s+/g, "").length < 40 || markdown.length < 40) {
    throw new Error("网页没有下发可读取的正文，可能需要登录、验证码或浏览器执行脚本");
  }

  return {
    title,
    description: description || textExcerpt(plainText),
    markdown,
    author: parsed?.author?.trim() || "",
    published: parsed?.published?.trim() || "",
    site: parsed?.site?.trim() || parsed?.domain?.trim() || new URL(url).hostname,
    wordCount: parsed?.wordCount || plainText.split(/\s+/).filter(Boolean).length,
    parser: "Defuddle",
  };
}

function createIcon(parent, icon, className = "") {
  const wrap = parent.createSpan({ cls: `akos-icon ${className}`.trim() });
  setIcon(wrap, icon);
  return wrap;
}

function createButton(parent, label, icon, className = "") {
  const button = parent.createEl("button", { cls: `akos-button ${className}`.trim() });
  if (icon) createIcon(button, icon);
  button.createSpan({ text: label });
  return button;
}

function bindPlannedFeature(button, featureName) {
  if (!button) return button;
  button.dataset.featureStatus = FEATURE_STATUS.PLANNED;
  button.setAttr("aria-label", featureName);
  button.setAttr("title", `${featureName} · 开发中`);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    new Notice(`${featureName}：开发中`);
  });
  return button;
}

function createPlannedIconButton(parent, icon, featureKey, className = "") {
  const feature = FEATURES[featureKey];
  const button = createButton(parent, "", icon, `akos-icon-button akos-planned-control ${className}`.trim());
  return bindPlannedFeature(button, feature?.label || "该功能");
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function inferInboxType(frontmatter, source) {
  if (frontmatter.source_url || /网页|公众号|youtube|http/i.test(source)) return "web";
  if (frontmatter.file_type || /上传|文件|pdf/i.test(source)) return "file";
  if (/语音/i.test(source)) return "voice";
  if (frontmatter.type === "agent-run") return "agent-run";
  return "note";
}

function getMessageText(message) {
  const content = message?.content ?? message?.text ?? message?.message ?? "";
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      return block?.text ?? block?.content ?? block?.value ?? "";
    }).filter(Boolean).join("\n\n").trim();
  }
  if (content && typeof content === "object") return String(content.text || content.value || "").trim();
  return "";
}

function getMessageRole(message) {
  return String(message?.role || message?.sender || message?.type || "").toLowerCase();
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

class KnowledgeOSRouter {
  constructor(plugin) {
    this.plugin = plugin;
  }

  async navigate(route, params = {}) {
    switch (route) {
      case "dashboard": return this.plugin.activateView(params);
      case "inbox": return this.plugin.activateInbox(params);
      case "knowledge": return this.plugin.activateKnowledge(params);
      case "graph": return this.plugin.activateGraph(params);
      case "projects": return this.plugin.activateProjects(params);
      case "agents": return this.plugin.activateAgents(params);
      case "analytics": return this.plugin.activateAnalytics(params);
      case "settings": return this.plugin.openSettings(params.section);
      default: throw new Error(`Unknown Knowledge OS route: ${route}`);
    }
  }
}

class ProjectOwnersModal extends Modal {
  constructor(app, project, onSave) {
    super(app);
    this.project = project;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "项目协作成员" });
    contentEl.createEl("p", { text: "成员仅保存到本地项目 frontmatter，不会发送外部邀请。" });
    const input = contentEl.createEl("textarea", {
      attr: { rows: "6", placeholder: "每行一个成员姓名", "aria-label": "项目成员列表" },
    });
    input.value = this.project.owners.join("\n");
    const actions = contentEl.createDiv({ cls: "akos-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const save = actions.createEl("button", { text: "保存成员", cls: "mod-cta" });
    cancel.addEventListener("click", () => this.close());
    save.addEventListener("click", async () => {
      const owners = [...new Set(input.value.split("\n").map((item) => item.trim()).filter(Boolean))];
      if (!owners.length) {
        new Notice("请至少保留一位项目成员");
        return;
      }
      await this.onSave(owners);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ActionConfirmModal extends Modal {
  constructor(app, title, description, items, confirmLabel, onConfirm) {
    super(app);
    this.title = title;
    this.description = description;
    this.items = items;
    this.confirmLabel = confirmLabel;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.title });
    contentEl.createEl("p", { text: this.description });
    const list = contentEl.createEl("ul", { cls: "akos-change-preview" });
    this.items.slice(0, 10).forEach((item) => list.createEl("li", { text: item }));
    if (this.items.length > 10) list.createEl("li", { text: `以及另外 ${this.items.length - 10} 项…` });
    const actions = contentEl.createDiv({ cls: "akos-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const confirm = actions.createEl("button", { text: this.confirmLabel, cls: "mod-cta" });
    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      await this.onConfirm();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class AgentTaskStore {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  async ensureStructure() {
    await ensureVaultFolder(this.app, `${ROOT}/Agents`);
    await ensureVaultFolder(this.app, `${ROOT}/Agents/Definitions`);
    await ensureVaultFolder(this.app, `${ROOT}/Agents/Runs`);
    await ensureVaultFolder(this.app, `${ROOT}/Agents/Outputs`);
  }

  async ensureDefinitions() {
    await this.ensureStructure();
    for (const agent of AGENT_DEFINITIONS) {
      const path = `${ROOT}/Agents/Definitions/${safeName(agent.name)}.md`;
      if (this.app.vault.getAbstractFileByPath(path) || await this.app.vault.adapter.exists(path)) continue;
      const content = `---\ntype: agent-definition\nagent_id: ${agent.id}\nname: ${yamlQuote(agent.name)}\nenabled: true\nprovider: claudian\noutput_type: ${yamlQuote(agent.output)}\nsource_scope:\n  - ${yamlQuote(`${ROOT}/Knowledge`)}\n---\n\n# ${agent.name}\n\n${agent.description}\n`;
      try {
        await this.app.vault.create(path, content);
      } catch (error) {
        const exists = this.app.vault.getAbstractFileByPath(path) || await this.app.vault.adapter.exists(path);
        if (exists && /already exists/i.test(error instanceof Error ? error.message : String(error))) continue;
        throw error;
      }
    }
  }

  definitionPath(agent) {
    return `${ROOT}/Agents/Definitions/${safeName(agent.name)}.md`;
  }

  async createRun(agent, prompt, sources = []) {
    await this.ensureStructure();
    const now = new Date();
    const taskId = `akos-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`;
    const path = `${ROOT}/Agents/Runs/${taskId}-${safeName(agent.name)}.md`;
    const sourcePaths = sources.map((file) => file.path || String(file)).filter(Boolean);
    const content = `---\ntype: agent-run\ntask_id: ${taskId}\nagent_id: ${agent.id}\nprovider: claudian\nstatus: queued\ncreated_at: ${now.toISOString()}\nstarted_at:\nfinished_at:\nconversation_id:\nsource_files: ${JSON.stringify(sourcePaths)}\noutput_file:\nerror:\nreviewed: false\ntask: ${yamlQuote(prompt)}\ntags:\n  - agent/run\n  - agent/${agent.id}\n---\n\n# ${agent.name} · 运行任务\n\n> [!info] Agent 职责\n> ${agent.description}\n\n## 输入来源\n\n${sourcePaths.length ? sourcePaths.map((pathValue) => `- [[${pathValue.replace(/\.md$/, "")}]]`).join("\n") : "- 暂无匹配来源"}\n\n## 任务\n\n${prompt}\n\n## 执行状态\n\n等待 Claudian 执行。\n`;
    const file = await this.app.vault.create(path, content);
    return { taskId, file, agent, prompt, sources: sourcePaths, status: AGENT_RUN_STATUSES.QUEUED };
  }

  async transition(taskOrFile, nextStatus, patch = {}) {
    const file = taskOrFile.file || taskOrFile;
    const cache = this.app.metadataCache.getFileCache(file);
    const current = String(taskOrFile.file ? taskOrFile.status : cache?.frontmatter?.status || AGENT_RUN_STATUSES.DRAFT);
    if (!AGENT_STATUS_TRANSITIONS[current]?.has(nextStatus)) {
      throw new Error(`Invalid agent task transition: ${current} -> ${nextStatus}`);
    }
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.status = nextStatus;
      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined) delete frontmatter[key];
        else frontmatter[key] = value;
      });
    });
    if (taskOrFile.file) taskOrFile.status = nextStatus;
    await this.updateRunBody(file, nextStatus, patch);
    await this.waitForFrontmatter(file, "status", nextStatus);
    return taskOrFile;
  }

  async waitForFrontmatter(file, key, expected, timeout = 2500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (this.app.metadataCache.getFileCache(file)?.frontmatter?.[key] === expected) return true;
      await wait(25);
    }
    return false;
  }

  async updateRunBody(file, status, patch = {}) {
    const labels = {
      draft: "任务仍为草稿。",
      queued: "任务已进入执行队列。",
      running: "Claudian 正在执行任务。",
      "waiting-review": patch.output_file ? `Claudian 已生成输出，等待人工验收：[[${String(patch.output_file).replace(/\.md$/, "")}]]` : "Claudian 已生成输出，等待人工验收。",
      success: "输出已经人工验收，任务执行成功。",
      failed: `任务执行失败：${patch.error || "未知错误"}`,
      blocked: `任务被阻塞：${patch.error || "依赖不可用"}`,
      cancelled: "任务已取消。",
    };
    const content = await this.app.vault.read(file);
    const marker = "## 执行状态\n\n";
    if (!content.includes(marker)) return;
    const start = content.indexOf(marker) + marker.length;
    const nextHeading = content.indexOf("\n## ", start);
    const end = nextHeading >= 0 ? nextHeading : content.length;
    const replacement = `${labels[status] || status}\n`;
    const updated = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    if (updated !== content) await this.app.vault.modify(file, updated);
  }

  async saveOutput(task, result) {
    const path = `${ROOT}/Agents/Outputs/${task.taskId}-${safeName(task.agent.name)}.md`;
    const content = `---\ntype: agent-output\ntask_id: ${task.taskId}\nagent_id: ${task.agent.id}\nprovider: claudian\nprovider_version: ${yamlQuote(result.providerVersion || "unknown")}\nconversation_id: ${yamlQuote(result.conversationId || "")}\ncreated_at: ${new Date().toISOString()}\nreviewed: false\ntags:\n  - agent/output\n  - agent/${task.agent.id}\n---\n\n# ${task.agent.name} · 输出\n\n## 任务\n\n${task.prompt}\n\n## 来源\n\n${task.sources.length ? task.sources.map((source) => `- [[${source.replace(/\.md$/, "")}]]`).join("\n") : "- 无显式来源"}\n\n## Claudian 输出\n\n${result.content}\n\n## 人工验收\n\n- [ ] 核对事实与引用\n- [ ] 确认结论可以使用\n- [ ] 在 Agent Center 标记验收通过\n`;
    return this.app.vault.create(path, content);
  }

  async approve(runFile) {
    const cache = this.app.metadataCache.getFileCache(runFile);
    const frontmatter = cache?.frontmatter || {};
    if (String(frontmatter.status) !== AGENT_RUN_STATUSES.WAITING_REVIEW) throw new Error("当前任务不在待验收状态");
    const outputPath = String(frontmatter.output_file || "");
    const outputFile = this.app.vault.getAbstractFileByPath(outputPath);
    if (!(outputFile instanceof TFile)) throw new Error("任务输出文件不存在");
    const output = await this.app.vault.cachedRead(outputFile);
    if (!cleanMarkdown(output)) throw new Error("任务输出为空");
    await this.app.fileManager.processFrontMatter(outputFile, (outputFrontmatter) => { outputFrontmatter.reviewed = true; });
    await this.transition(runFile, AGENT_RUN_STATUSES.SUCCESS, { reviewed: true, reviewed_at: new Date().toISOString() });
  }
}

class ClaudianAdapter {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.cancelledTasks = new Set();
  }

  detect() {
    const claudian = this.app.plugins?.plugins?.realclaudian;
    const version = String(claudian?.manifest?.version || "");
    const compatible = Boolean(
      claudian
      && CLAUDIAN_COMPAT[version]
      && typeof claudian.ensureViewOpen === "function"
      && typeof claudian.getView === "function"
    );
    return { available: Boolean(claudian), compatible, version, adapter: CLAUDIAN_COMPAT[version] || null };
  }

  cancel(taskId) {
    this.cancelledTasks.add(taskId);
  }

  async execute(task) {
    const capability = this.detect();
    if (!capability.available) throw new Error("Claudian 未安装或未启用");
    if (!capability.compatible) throw new Error(`Claudian ${capability.version || "未知版本"} 当前暂未适配`);
    const claudian = this.app.plugins.plugins.realclaudian;
    await claudian.ensureViewOpen();
    const view = claudian.getView();
    const manager = view?.getTabManager?.();
    if (!manager) throw new Error("Claudian TabManager 不可用");
    if (typeof manager.createNewConversation === "function") await manager.createNewConversation();
    const tab = manager.getActiveTab?.();
    const input = tab?.controllers?.inputController;
    if (!tab || typeof input?.sendMessage !== "function") throw new Error("Claudian 消息发送接口不可用");
    const beforeMessages = [...(tab.state?.state?.messages || [])];
    await input.sendMessage({ content: task.prompt });
    const result = await this.collectResult(tab, beforeMessages.length, task.taskId);
    return { ...result, providerVersion: capability.version };
  }

  async collectResult(tab, beforeCount, taskId) {
    const started = Date.now();
    const hardTimeout = 15 * 60 * 1000;
    while (Date.now() - started < hardTimeout) {
      if (this.cancelledTasks.has(taskId)) {
        this.cancelledTasks.delete(taskId);
        throw new Error("任务已取消");
      }
      const state = tab.state?.state || {};
      if (state.cancelRequested) throw new Error("Claudian 已取消本次生成");
      const messages = Array.isArray(state.messages) ? state.messages : [];
      const assistants = messages.slice(beforeCount).filter((message) => /assistant|claude/i.test(getMessageRole(message)) && getMessageText(message));
      const hasPendingTools = Array.isArray(state.pendingTools) ? state.pendingTools.length > 0 : Boolean(state.pendingTools?.size);
      if (!state.isStreaming && !hasPendingTools && assistants.length) {
        const latest = assistants[assistants.length - 1];
        const failedTool = (Array.isArray(latest.toolCalls) ? latest.toolCalls : []).find((tool) => /fail|error/i.test(String(tool?.status || tool?.state || "")));
        if (failedTool) throw new Error("Claudian 工具调用失败，任务未生成可验收输出");
        return {
          content: getMessageText(latest),
          conversationId: String(state.currentConversationId || state.conversationId || state.conversation?.id || tab.id || ""),
        };
      }
      await wait(500);
    }
    throw new Error("Claudian 执行超过 15 分钟，已停止等待");
  }
}

class PromptModal extends Modal {
  constructor(app, title, description, onSubmit, placeholder = "输入名称…", submitLabel = "创建") {
    super(app);
    this.title = title;
    this.description = description;
    this.onSubmit = onSubmit;
    this.placeholder = placeholder;
    this.submitLabel = submitLabel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("akos-modal");
    contentEl.createEl("h2", { text: this.title });
    contentEl.createEl("p", { text: this.description, cls: "akos-modal-description" });
    const input = contentEl.createEl("input", {
      cls: "akos-modal-input",
      attr: { type: "text", placeholder: this.placeholder },
    });
    const actions = contentEl.createDiv({ cls: "akos-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const submit = actions.createEl("button", { text: this.submitLabel, cls: "mod-cta" });
    cancel.addEventListener("click", () => this.close());
    const confirm = async () => {
      const value = input.value.trim();
      if (!value) return;
      this.close();
      await this.onSubmit(value);
    };
    submit.addEventListener("click", confirm);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") confirm();
    });
    window.setTimeout(() => input.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class VoiceDictationModal extends Modal {
  constructor(app, message, onSubmit) {
    super(app);
    this.message = message;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("akos-modal");
    contentEl.createEl("h2", { text: "系统听写录入" });
    contentEl.createEl("p", { text: this.message, cls: "akos-modal-description" });
    contentEl.createDiv({
      text: process.platform === "darwin"
        ? "点击下方输入框，然后使用 macOS 听写快捷键（通常为连按两次 Fn/地球键）。"
        : "点击下方输入框，然后使用系统听写快捷键录入。",
      cls: "akos-dictation-tip",
    });
    const input = contentEl.createEl("textarea", {
      cls: "akos-modal-input akos-dictation-input",
      attr: {
        rows: "6",
        placeholder: "听写结果会出现在这里…",
        "aria-label": "系统听写文本",
      },
    });
    const actions = contentEl.createDiv({ cls: "akos-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const submit = actions.createEl("button", { text: "保存到 Inbox", cls: "mod-cta" });
    cancel.addEventListener("click", () => this.close());
    const confirm = async () => {
      const value = input.value.trim();
      if (!value) {
        new Notice("请先完成听写或输入内容");
        return;
      }
      this.close();
      await this.onSubmit(value);
    };
    submit.addEventListener("click", confirm);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void confirm();
    });
    window.setTimeout(() => input.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  constructor(app, title, message, onConfirm) {
    super(app);
    this.title = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    this.contentEl.addClass("akos-modal");
    this.contentEl.createEl("h2", { text: this.title });
    this.contentEl.createEl("p", { text: this.message, cls: "akos-modal-description" });
    const actions = this.contentEl.createDiv({ cls: "akos-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    const confirm = actions.createEl("button", { text: "移到 Obsidian 回收站", cls: "mod-warning" });
    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", async () => {
      this.close();
      await this.onConfirm();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

function inferInboxTags(text = "", source = "") {
  const haystack = `${text} ${source}`.toLowerCase();
  const tags = [];
  const add = (...values) => values.forEach((value) => {
    if (!tags.includes(value)) tags.push(value);
  });
  if (/(agent|claude|codex|智能体)/i.test(haystack)) add("AI技术", "Agent");
  if (/(rag|知识库|检索|向量|embedding)/i.test(haystack)) add("知识库", "AI技术");
  if (/(客户|企业|交流|需求|方案)/i.test(haystack)) add("客户交流", "企业案例");
  if (/(产品|需求文档|prd|竞品)/i.test(haystack)) add("产品研究");
  if (/(视频|youtube|公众号|文章|内容)/i.test(haystack)) add("内容素材");
  if (/(学习|课程|论文|资料)/i.test(haystack)) add("学习资料");
  if (!tags.length) add("待分类");
  return tags.slice(0, 4);
}

function inferInboxCategory(tags) {
  if (tags.includes("客户交流") || tags.includes("企业案例")) return "企业案例";
  if (tags.includes("AI技术") || tags.includes("Agent") || tags.includes("知识库")) return "AI技术";
  if (tags.includes("产品研究")) return "产品研究";
  if (tags.includes("内容素材")) return "内容素材";
  if (tags.includes("学习资料")) return "学习资料";
  return "其他";
}

async function ensureVaultFolder(app, path) {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const indexed = app.vault.getAbstractFileByPath(current);
    if (indexed) {
      if (indexed instanceof TFile) throw new Error(`无法创建目录“${current}”：同名文件已存在`);
      continue;
    }

    const existing = await app.vault.adapter.stat(current).catch(() => null);
    if (existing) {
      if (existing.type !== "folder") throw new Error(`无法创建目录“${current}”：同名文件已存在`);
      continue;
    }

    try {
      await app.vault.createFolder(current);
    } catch (error) {
      const created = app.vault.getAbstractFileByPath(current);
      const stat = await app.vault.adapter.stat(current).catch(() => null);
      const isExistingFolder = Boolean(created && !(created instanceof TFile)) || stat?.type === "folder";
      if (isExistingFolder && /already exists/i.test(error instanceof Error ? error.message : String(error))) continue;
      throw error;
    }
  }
}

async function uniqueVaultPath(app, path) {
  if (!app.vault.getAbstractFileByPath(path)) return path;
  const dot = path.lastIndexOf(".");
  const base = dot > path.lastIndexOf("/") ? path.slice(0, dot) : path;
  const ext = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
  let index = 2;
  while (app.vault.getAbstractFileByPath(`${base}-${index}${ext}`)) index += 1;
  return `${base}-${index}${ext}`;
}

class InboxView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filter = "all";
    this.typeFilter = "all";
    this.sourceFilter = "all";
    this.sortMode = "captured-desc";
    this.query = "";
    this.assistantCollapsed = false;
    this.renderVersion = 0;
    this.refresh = debounce(() => this.render(), 350);
  }

  getViewType() {
    return INBOX_VIEW_TYPE;
  }

  getDisplayText() {
    return "Inbox · AI Knowledge OS";
  }

  getIcon() {
    return "inbox";
  }

  async onOpen() {
    this.contentEl.addClass("akos-view-content", "akos-inbox-view-content");
    await this.render();
  }

  async onClose() {
    this.contentEl.removeClass("akos-view-content", "akos-inbox-view-content");
  }

  async getItems() {
    const candidates = this.app.vault.getMarkdownFiles().filter((file) => {
      if (file.path === `${ROOT}/00-Inbox/README.md`) return false;
      if (file.path.startsWith(`${ROOT}/00-Inbox/Attachments/`)) return false;
      const cache = this.app.metadataCache.getFileCache(file);
      return file.path.startsWith(`${ROOT}/00-Inbox/`) || cache?.frontmatter?.type === "inbox";
    });
    const items = [];
    for (const file of candidates) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter || {};
      const content = await this.app.vault.cachedRead(file);
      const clean = cleanMarkdown(content)
        .replace(/\[![^\]]+\]\s*/g, "")
        .replace(/^示例收集项\s*/i, "");
      const source = String(frontmatter.source || (file.path.includes("Archive/") ? "已归档" : "快速记录"));
      const suggested = Array.isArray(frontmatter.ai_suggested_tags)
        ? frontmatter.ai_suggested_tags.map(String)
        : inferInboxTags(`${file.basename} ${clean}`, source);
      const status = file.path.includes("/Archive/") ? "archived" : String(frontmatter.status || "pending");
      items.push({
        file,
        cache,
        frontmatter,
        content,
        clean,
        source,
        suggested,
        category: String(frontmatter.ai_category || inferInboxCategory(suggested)),
        type: inferInboxType(frontmatter, source),
        status,
        priority: Boolean(frontmatter.priority),
        capturedAt: frontmatter.captured_at ? Date.parse(frontmatter.captured_at) : file.stat.ctime,
      });
    }
    return items.sort((a, b) => b.capturedAt - a.capturedAt);
  }

  getVaultStats(items) {
    const files = this.app.vault.getMarkdownFiles();
    const resolved = this.app.metadataCache.resolvedLinks || {};
    let links = 0;
    let bytes = 0;
    files.forEach((file) => { bytes += file.stat.size; });
    Object.values(resolved).forEach((targets) => { links += Object.keys(targets || {}).length; });
    const pending = items.filter((item) => item.status === "pending").length;
    const processed = items.filter((item) => item.status === "processed").length;
    const archived = items.filter((item) => item.status === "archived").length;
    const classified = items.filter((item) => !item.suggested.includes("待分类")).length;
    return { files, links, bytes, pending, processed, archived, classified };
  }

  async render() {
    const version = ++this.renderVersion;
    const items = await this.getItems();
    if (version !== this.renderVersion) return;
    const stats = this.getVaultStats(items);
    const root = this.contentEl;
    root.empty();
    const app = root.createDiv({ cls: "akos-app akos-inbox-app" });
    this.renderSidebar(app, stats);
    const center = app.createDiv({ cls: "akos-center akos-inbox-center" });
    this.renderTopbar(center);
    const scroll = center.createDiv({ cls: "akos-scroll akos-inbox-scroll" });
    this.renderInboxHeader(scroll, stats);
    this.renderCaptureActions(scroll);
    this.renderInboxToolbar(scroll, stats, items);
    this.renderItemList(scroll, this.sortInboxItems(items));
    this.renderStatus(center, stats);
    this.renderAssistant(app, items, stats);
    this.applyFilter();
  }

  renderSidebar(app, stats) {
    const sidebar = app.createEl("aside", { cls: "akos-sidebar" });
    const brand = sidebar.createDiv({ cls: "akos-brand" });
    const logo = brand.createDiv({ cls: "akos-logo" });
    logo.createSpan({ cls: "akos-logo-diamond akos-logo-a" });
    logo.createSpan({ cls: "akos-logo-diamond akos-logo-b" });
    const brandText = brand.createDiv();
    brandText.createDiv({ text: "Obsidian AI", cls: "akos-brand-title" });
    brandText.createDiv({ text: "Knowledge OS", cls: "akos-brand-subtitle" });

    sidebar.createDiv({ text: "MAIN", cls: "akos-nav-label" });
    const nav = sidebar.createEl("nav", { cls: "akos-nav" });
    const navItems = [
      ["Dashboard", "知识驾驶舱", "layout-dashboard", () => this.plugin.router.navigate("dashboard"), false],
      ["Inbox", "信息收集箱", "inbox", () => {}, true, stats.pending],
      ["Knowledge", "知识中心", "book-open", () => this.plugin.router.navigate("knowledge")],
      ["Graph", "知识网络", "share-2", () => this.plugin.router.navigate("graph")],
      ["Projects", "项目管理", "folder-kanban", () => this.plugin.router.navigate("projects")],
      ["AI Agents", "智能体中心", "bot", () => this.plugin.router.navigate("agents")],
      ["Analytics", "数据分析", "chart-no-axes-combined", () => this.plugin.router.navigate("analytics")],
    ];
    navItems.forEach(([title, subtitle, icon, action, active, badge]) => {
      const button = nav.createEl("button", { cls: `akos-nav-item${active ? " is-active" : ""}` });
      createIcon(button, icon);
      const copy = button.createDiv({ cls: "akos-nav-copy" });
      copy.createDiv({ text: title, cls: "akos-nav-title" });
      copy.createDiv({ text: subtitle, cls: "akos-nav-subtitle" });
      if (badge) button.createSpan({ text: String(badge), cls: "akos-nav-badge" });
      button.addEventListener("click", action);
    });

    sidebar.createDiv({ cls: "akos-sidebar-rule" });
    sidebar.createDiv({ text: "SYSTEM", cls: "akos-nav-label" });
    const system = sidebar.createDiv({ cls: "akos-nav" });
    const templates = createButton(system, "Templates", "notebook-tabs", "akos-nav-compact");
    templates.addEventListener("click", () => this.openFolder(`${ROOT}/Templates`));
    const settings = createButton(system, "Settings", "settings", "akos-nav-compact");
    settings.addEventListener("click", () => this.plugin.openSettings());

    const card = sidebar.createDiv({ cls: "akos-vault-card akos-inbox-stats-card" });
    const title = card.createDiv({ cls: "akos-vault-card-title" });
    title.createSpan({ text: "Inbox 统计" });
    createIcon(title, "chart-no-axes-column-increasing");
    [
      ["待处理", stats.pending],
      ["已处理", stats.processed],
      ["自动归档", stats.archived],
      ["AI 可识别", `${itemsPercent(stats.classified, stats.pending + stats.processed + stats.archived)}%`],
    ].forEach(([label, value]) => {
      const row = card.createDiv({ cls: "akos-vault-row" });
      row.createSpan({ text: label });
      row.createEl("strong", { text: String(value) });
    });
    const meter = card.createDiv({ cls: "akos-meter" });
    meter.createSpan({ attr: { style: `width:${itemsPercent(stats.classified, stats.pending + stats.processed + stats.archived)}%` } });
    const capacity = card.createDiv({ cls: "akos-inbox-capacity" });
    capacity.createSpan({ text: "全部内容保存在本地 Vault" });
  }

  renderTopbar(center) {
    const topbar = center.createDiv({ cls: "akos-topbar" });
    const searchWrap = topbar.createDiv({ cls: "akos-search akos-inbox-search" });
    createIcon(searchWrap, "search");
    const search = searchWrap.createEl("input", {
      attr: { type: "search", placeholder: "搜索 Inbox 内容…", "aria-label": "搜索 Inbox 内容" },
    });
    search.value = this.query;
    search.addEventListener("input", () => {
      this.query = search.value.trim().toLowerCase();
      this.applyFilter();
    });
    searchWrap.createSpan({ text: "⌘ K", cls: "akos-shortcut" });
    const actions = topbar.createDiv({ cls: "akos-top-actions" });
    const ai = createButton(actions, "AI 助手", "sparkles", "akos-top-action");
    ai.addEventListener("click", () => void this.openAssistant());
    const insight = createButton(actions, "今日洞察", "lightbulb", "akos-top-action");
    insight.addEventListener("click", () => this.contentEl.querySelector(".akos-inbox-smart-suggestions")?.scrollIntoView({ behavior: "smooth", block: "center" }));
    const add = createButton(actions, "", "square-pen", "akos-icon-button");
    add.setAttr("aria-label", "快速记录");
    add.addEventListener("click", () => this.createQuickNote());
    const avatar = actions.createEl("button", { cls: "akos-avatar-button" });
    avatar.createSpan({ text: (this.plugin.settings.userName || "E").charAt(0).toUpperCase(), cls: "akos-avatar" });
    avatar.createSpan({ text: this.plugin.settings.userName || "Ethan" });
    createIcon(avatar, "chevron-down");
    avatar.addEventListener("click", () => this.plugin.openSettings());
  }

  async openAssistant() {
    if (this.assistantCollapsed) {
      this.assistantCollapsed = false;
      await this.render();
    }
    const assistant = this.contentEl.querySelector(".akos-inbox-assistant");
    assistant?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    assistant?.querySelector(".akos-inbox-start-ai, .akos-inbox-smart-row")?.focus();
  }

  renderInboxHeader(parent, stats) {
    const header = parent.createDiv({ cls: "akos-inbox-header" });
    const icon = createIcon(header, "inbox", "akos-inbox-title-icon");
    icon.setAttr("aria-hidden", "true");
    const copy = header.createDiv();
    copy.createEl("h1", { text: "Inbox" });
    copy.createEl("p", { text: "所有未经整理的信息都在这里，AI 帮你自动识别、分类和关联。" });
    if (stats.pending) header.createSpan({ text: `${stats.pending} 条待处理`, cls: "akos-inbox-pending-pill" });
  }

  renderCaptureActions(parent) {
    const grid = parent.createDiv({ cls: "akos-capture-grid" });
    const actions = [
      ["快速记录", "随时记录想法", "notebook-pen", "blue", () => this.createQuickNote()],
      ["粘贴网页", "保存网页内容", "panels-top-left", "indigo", () => this.captureWebPrompt()],
      ["上传文件", "导入本地文件", "file-up", "green", () => this.uploadFiles()],
      ["语音转文字", "语音快速输入", "audio-lines", "purple", (button) => this.startVoiceCapture(button)],
      ["AI 批量整理", "一键智能处理", "brain-circuit", "orange", () => this.batchClassify()],
    ];
    actions.forEach(([title, subtitle, icon, color, action]) => {
      const button = grid.createEl("button", { cls: "akos-capture-card" });
      createIcon(button, icon, `akos-capture-icon is-${color}`);
      const copy = button.createDiv();
      copy.createEl("strong", { text: title });
      copy.createSpan({ text: subtitle });
      button.addEventListener("click", () => action(button));
    });
  }

  renderInboxToolbar(parent, stats, items) {
    const toolbar = parent.createDiv({ cls: "akos-inbox-toolbar" });
    const tabs = toolbar.createDiv({ cls: "akos-inbox-tabs" });
    [
      ["all", "全部", stats.pending + stats.processed + stats.archived],
      ["pending", "待处理", stats.pending],
      ["processed", "已处理", stats.processed],
      ["archived", "已归档", stats.archived],
    ].forEach(([value, label, count]) => {
      const tab = tabs.createEl("button", { cls: this.filter === value ? "is-active" : "" });
      tab.createSpan({ text: label });
      if (count) tab.createSpan({ text: String(count), cls: "akos-inbox-tab-count" });
      tab.addEventListener("click", () => {
        this.filter = value;
        tabs.querySelectorAll("button").forEach((item) => item.removeClass("is-active"));
        tab.addClass("is-active");
        this.applyFilter();
      });
    });
    const filters = toolbar.createDiv({ cls: "akos-inbox-filters" });
    const type = filters.createEl("select", { cls: "akos-inbox-filter-button", attr: { "aria-label": "内容类型" } });
    [["all", "全部类型"], ["note", "快速记录"], ["web", "网页"], ["file", "上传文件"], ["voice", "语音记录"], ["agent-run", "Agent 任务"]].forEach(([value, label]) => type.createEl("option", { value, text: label }));
    type.value = this.typeFilter;
    type.addEventListener("change", () => { this.typeFilter = type.value; this.applyFilter(); });
    const source = filters.createEl("select", { cls: "akos-inbox-filter-button", attr: { "aria-label": "内容来源" } });
    source.createEl("option", { value: "all", text: "全部来源" });
    [...new Set(items.map((item) => item.source))].sort((a, b) => a.localeCompare(b, "zh-CN")).forEach((value) => source.createEl("option", { value, text: value }));
    source.value = this.sourceFilter;
    source.addEventListener("change", () => { this.sourceFilter = source.value; this.applyFilter(); });
    const sort = filters.createEl("select", { cls: "akos-inbox-filter-button", attr: { "aria-label": "排序方式" } });
    [["captured-desc", "最新"], ["captured-asc", "最早"], ["updated-desc", "最近更新"], ["priority-desc", "高价值优先"], ["title-asc", "标题排序"]].forEach(([value, label]) => sort.createEl("option", { value, text: label }));
    sort.value = this.sortMode;
    sort.addEventListener("change", () => { this.sortMode = sort.value; void this.render(); });
  }

  renderItemList(parent, items) {
    const list = parent.createDiv({ cls: "akos-inbox-list" });
    if (!items.length) {
      const empty = list.createDiv({ cls: "akos-inbox-empty" });
      createIcon(empty, "inbox");
      empty.createEl("h3", { text: "Inbox 已清空" });
      empty.createEl("p", { text: "用上方入口快速记录、粘贴网页或上传文件。" });
      const add = createButton(empty, "快速记录", "plus", "akos-inbox-primary");
      add.addEventListener("click", () => this.createQuickNote());
      return;
    }
    items.forEach((item) => this.renderItem(list, item));
    list.createDiv({ text: "没有更多内容了", cls: "akos-inbox-end" });
  }

  renderItem(list, item) {
    const card = list.createDiv({ cls: "akos-inbox-item" });
    card.dataset.status = item.status;
    card.dataset.type = item.type;
    card.dataset.source = item.source;
    card.dataset.search = `${item.file.basename} ${item.source} ${item.clean} ${item.suggested.join(" ")}`.toLowerCase();
    const visual = card.createDiv({ cls: "akos-inbox-item-visual" });
    const [icon, tone] = this.sourceVisual(item);
    createIcon(visual, icon, `is-${tone}`);
    visual.createSpan({ text: item.source.slice(0, 8) });

    const body = card.createDiv({ cls: "akos-inbox-item-body" });
    const titleRow = body.createDiv({ cls: "akos-inbox-item-title-row" });
    const title = titleRow.createEl("button", { text: item.file.basename, cls: "akos-inbox-item-title" });
    title.addEventListener("click", () => this.openFile(item.file.path));
    if (item.frontmatter.demo) titleRow.createSpan({ text: "示例", cls: "akos-inbox-demo" });
    const meta = body.createDiv({ cls: "akos-inbox-item-meta" });
    meta.createSpan({ text: item.source });
    meta.createEl("i");
    meta.createSpan({ text: formatRelativeTime(item.capturedAt) });
    if (item.file.stat.size > 1024) {
      meta.createEl("i");
      meta.createSpan({ text: formatSize(item.file.stat.size) });
    }
    body.createEl("p", { text: item.clean.slice(0, 150) || "等待补充内容…" });

    const suggestions = card.createDiv({ cls: "akos-inbox-item-suggestions" });
    const tagWrap = suggestions.createDiv({ cls: "akos-inbox-item-tags" });
    item.suggested.slice(0, 3).forEach((tag) => tagWrap.createSpan({ text: tag, cls: "akos-inbox-suggested-tag" }));
    const addTag = suggestions.createEl("button", { text: "+ 添加标签", cls: "akos-inbox-add-tag" });
    addTag.addEventListener("click", () => this.addTag(item));

    const actions = card.createDiv({ cls: "akos-inbox-item-actions" });
    const iconRow = actions.createDiv({ cls: "akos-inbox-item-icon-row" });
    const priority = createButton(iconRow, "", item.priority ? "bookmark-check" : "bookmark", "akos-inbox-item-icon-button");
    priority.setAttr("aria-label", "标记高价值内容");
    priority.addEventListener("click", () => this.togglePriority(item));
    const more = createButton(iconRow, "", "ellipsis", "akos-inbox-item-icon-button");
    more.setAttr("aria-label", "打开原笔记");
    more.addEventListener("click", () => this.openFile(item.file.path));
    const actionRow = actions.createDiv({ cls: "akos-inbox-item-action-row" });
    if (item.status === "pending") {
      const save = createButton(actionRow, "保存", "check", "akos-inbox-save");
      save.addEventListener("click", () => this.saveItem(item));
      const archive = createButton(actionRow, "归档", "archive", "akos-inbox-secondary");
      archive.addEventListener("click", () => this.archiveItem(item));
    } else if (item.status === "archived") {
      const restore = createButton(actionRow, "恢复", "rotate-ccw", "akos-inbox-secondary");
      restore.addEventListener("click", () => this.restoreItem(item));
    } else {
      const saved = createButton(actionRow, "已保存", "circle-check-big", "akos-inbox-saved");
      saved.addEventListener("click", () => this.openFile(item.file.path));
    }
    const remove = createButton(actionRow, "", "trash-2", "akos-inbox-delete");
    remove.setAttr("aria-label", "删除");
    remove.addEventListener("click", () => this.deleteItem(item));
  }

  renderAssistant(app, items, stats) {
    const aside = app.createEl("aside", { cls: "akos-inbox-assistant" });
    app.toggleClass("is-inbox-assistant-collapsed", this.assistantCollapsed);
    aside.toggleClass("is-collapsed", this.assistantCollapsed);
    const header = aside.createDiv({ cls: "akos-inbox-assistant-header" });
    const title = header.createDiv();
    createIcon(title, "sparkles");
    title.createEl("strong", { text: "AI 助手" });
    const toggle = createButton(
      header,
      "",
      this.assistantCollapsed ? "panel-left-open" : "panel-right-close",
      "akos-icon-button akos-assistant-toggle"
    );
    toggle.setAttr("aria-label", this.assistantCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.setAttr("title", this.assistantCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.addEventListener("click", () => {
      this.assistantCollapsed = !this.assistantCollapsed;
      void this.render();
    });
    const scroll = aside.createDiv({ cls: "akos-inbox-assistant-scroll" });
    scroll.createEl("h2", { text: `你好，${this.plugin.settings.userName} 👋` });
    scroll.createEl("p", { text: "我正在分析你的 Inbox 内容，为你提供智能建议。", cls: "akos-inbox-assistant-subtitle" });

    scroll.createEl("h3", { text: "智能建议", cls: "akos-inbox-side-heading" });
    const suggestions = scroll.createDiv({ cls: "akos-inbox-smart-suggestions" });
    [
      ["高价值内容", items.filter((item) => item.priority || /方案|需求|客户|报告/i.test(item.file.basename)).length, "star", "建议优先处理这些重要内容", () => this.setFilter("pending")],
      ["可自动归档", items.filter((item) => item.status === "pending" && item.suggested.length > 1).length, "archive-restore", "这些内容可以自动归档", () => this.batchClassify()],
      ["需补充标签", items.filter((item) => item.suggested.includes("待分类")).length, "circle-dot", "建议补充标签以便更好地组织", () => this.setFilter("pending")],
    ].forEach(([label, count, icon, description, action]) => {
      const row = suggestions.createEl("button", { cls: "akos-inbox-smart-row" });
      createIcon(row, icon);
      const copy = row.createDiv();
      const line = copy.createDiv();
      line.createEl("strong", { text: label });
      line.createSpan({ text: String(count) });
      copy.createEl("p", { text: description });
      createIcon(row, "chevron-right");
      row.addEventListener("click", action);
    });

    const distribution = this.categoryDistribution(items.filter((item) => item.status === "pending"));
    scroll.createEl("h3", { text: "自动分类预览", cls: "akos-inbox-side-heading" });
    const categoryCard = scroll.createDiv({ cls: "akos-inbox-category-card" });
    const donut = categoryCard.createDiv({ cls: "akos-inbox-donut" });
    donut.setAttr("style", `background:${this.donutGradient(distribution)}`);
    const donutCenter = donut.createDiv();
    donutCenter.createEl("strong", { text: String(stats.pending) });
    donutCenter.createSpan({ text: "待处理" });
    const legend = categoryCard.createDiv({ cls: "akos-inbox-category-legend" });
    const colors = ["#775fff", "#9c7aff", "#45b96b", "#a89138", "#73798a"];
    distribution.forEach(([label, count], index) => {
      const row = legend.createDiv();
      row.createEl("i", { attr: { style: `background:${colors[index]}` } });
      row.createSpan({ text: label });
      row.createEl("strong", { text: String(count) });
    });

    scroll.createEl("h3", { text: "标签推荐", cls: "akos-inbox-side-heading" });
    const tagCard = scroll.createDiv({ cls: "akos-inbox-recommended-tags" });
    const tagCounts = new Map();
    items.filter((item) => item.status === "pending").forEach((item) => item.suggested.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
    [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).forEach(([tag]) => {
      const button = tagCard.createEl("button", { text: `#${tag}` });
      button.addEventListener("click", () => {
        this.query = tag.toLowerCase();
        this.applyFilter();
      });
    });

    scroll.createEl("h3", { text: "快速操作", cls: "akos-inbox-side-heading" });
    const quick = scroll.createDiv({ cls: "akos-inbox-quick-actions" });
    const reviewed = createButton(quick, "全部标记为已读", "circle-check-big");
    reviewed.addEventListener("click", () => this.markAllReviewed(items));
    const batch = createButton(quick, "AI 批量分类", "brain-circuit");
    batch.addEventListener("click", () => this.batchClassify());
    const exportButton = createButton(quick, "导出 Inbox 内容", "download");
    exportButton.addEventListener("click", () => this.exportInbox(items));
    const start = createButton(quick, "开始智能整理", "sparkles", "akos-inbox-start-ai");
    start.addEventListener("click", () => this.batchClassify());
    quick.createDiv({ text: "AI 会先提供建议，内容移动和删除仍由你确认。", cls: "akos-inbox-ai-note" });
  }

  renderStatus(center, stats) {
    const bar = center.createDiv({ cls: "akos-status" });
    bar.createSpan({ text: `Inbox: ${stats.pending} 条待处理` });
    bar.createEl("i");
    bar.createSpan({ text: `${stats.processed} 条已处理` });
    bar.createSpan({ text: `${stats.archived} 条已归档` });
    const model = bar.createSpan({ cls: "akos-status-model" });
    model.createEl("i");
    model.createSpan({ text: "Local AI Classification" });
  }

  sourceVisual(item) {
    const source = item.source.toLowerCase();
    if (/微信|沟通/.test(source)) return ["message-circle", "green"];
    if (/网页|公众号|youtube/.test(source)) return ["panels-top-left", "blue"];
    if (/上传|文件|pdf/.test(source)) return ["file-text", "red"];
    if (/语音/.test(source)) return ["audio-lines", "purple"];
    return ["notebook-text", "indigo"];
  }

  categoryDistribution(items) {
    const counts = new Map();
    items.forEach((item) => counts.set(item.category, (counts.get(item.category) || 0) + 1));
    const defaults = ["AI技术", "企业案例", "内容素材", "学习资料", "其他"];
    defaults.forEach((label) => { if (!counts.has(label)) counts.set(label, 0); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }

  donutGradient(distribution) {
    const colors = ["#775fff", "#9c7aff", "#45b96b", "#a89138", "#73798a"];
    const total = Math.max(1, distribution.reduce((sum, [, count]) => sum + count, 0));
    let offset = 0;
    const parts = distribution.map(([, count], index) => {
      const start = offset;
      offset += (count / total) * 100;
      return `${colors[index]} ${start}% ${offset}%`;
    });
    if (offset < 100) parts.push(`#252b3a ${offset}% 100%`);
    return `conic-gradient(${parts.join(",")})`;
  }

  setFilter(filter) {
    this.filter = filter;
    this.contentEl.querySelectorAll(".akos-inbox-tabs button").forEach((button, index) => {
      const values = ["all", "pending", "processed", "archived"];
      button.toggleClass("is-active", values[index] === filter);
    });
    this.applyFilter();
  }

  applyFilter() {
    const cards = this.contentEl.querySelectorAll(".akos-inbox-item");
    let visible = 0;
    cards.forEach((card) => {
      const matchesStatus = this.filter === "all" || card.dataset.status === this.filter;
      const matchesQuery = !this.query || (card.dataset.search || "").includes(this.query);
      const matchesType = this.typeFilter === "all" || card.dataset.type === this.typeFilter;
      const matchesSource = this.sourceFilter === "all" || card.dataset.source === this.sourceFilter;
      const show = matchesStatus && matchesQuery && matchesType && matchesSource;
      card.toggleClass("is-filtered", !show);
      if (show) visible += 1;
    });
    const end = this.contentEl.querySelector(".akos-inbox-end");
    if (end) end.setText(visible ? "没有更多内容了" : "没有符合条件的内容");
  }

  sortInboxItems(items) {
    const sorted = [...items];
    if (this.sortMode === "captured-asc") sorted.sort((a, b) => a.capturedAt - b.capturedAt);
    else if (this.sortMode === "updated-desc") sorted.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime);
    else if (this.sortMode === "priority-desc") sorted.sort((a, b) => Number(b.priority) - Number(a.priority) || b.capturedAt - a.capturedAt);
    else if (this.sortMode === "title-asc") sorted.sort((a, b) => a.file.basename.localeCompare(b.file.basename, "zh-CN"));
    else sorted.sort((a, b) => b.capturedAt - a.capturedAt);
    return sorted;
  }

  async openFile(path) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (file) await this.app.workspace.getLeaf("tab").openFile(file);
  }

  openFolder(path) {
    const explorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
    if (!explorer) {
      new Notice("文件管理器未启用，无法定位目录");
      return;
    }
    void this.app.workspace.revealLeaf(explorer);
    const item = explorer.view?.fileItems?.[path];
    if (item) {
      item.setCollapsed?.(false);
      item.el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      item.el?.addClass?.("is-flashing");
      window.setTimeout(() => item.el?.removeClass?.("is-flashing"), 1200);
      new Notice(`已定位：${path}`);
    } else {
      new Notice(`目录不存在：${path}`);
    }
  }

  createQuickNote() {
    new PromptModal(this.app, "快速记录", "先把想法放进 Inbox，之后再分类、连接和整理。", async (title) => {
      const name = safeName(title);
      const path = await uniqueVaultPath(this.app, `${ROOT}/00-Inbox/${name}.md`);
      const content = `---\ntitle: "${name.replace(/"/g, "\\\"")}"\ntype: inbox\nstatus: pending\nsource: 快速记录\ncaptured_at: ${new Date().toISOString()}\ntags:\n  - inbox\n---\n\n# ${name}\n\n## 原始信息\n\n\n## 下一步\n\n- [ ] 让 AI 建议分类、标签和关联\n`;
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf("tab").openFile(file);
      new Notice("已保存到 Inbox");
    }).open();
  }

  captureWebPrompt() {
    new PromptModal(
      this.app,
      "粘贴网页",
      "粘贴网页 URL，我会提取标题和摘要并保存为本地 Markdown。",
      async (url) => this.captureWebPage(url),
      "https://example.com/article",
      "保存网页",
    ).open();
  }

  async captureWebPage(url) {
    let parsed;
    try {
      parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("Unsupported protocol");
    } catch (_) {
      new Notice("请输入完整的 http:// 或 https:// 链接");
      return;
    }
    new Notice("正在读取网页…");
    const canonicalUrl = parsed.toString();
    let page = null;
    let captureError = "";
    try {
      let lastError = null;
      const userAgents = [
        "Mozilla/5.0 (compatible; Defuddle/1.0; +https://defuddle.md)",
        "Mozilla/5.0 (compatible; Defuddle/1.0; +https://defuddle.md) bot",
      ];
      for (const userAgent of userAgents) {
        try {
          const html = await requestWebHtml(canonicalUrl, userAgent);
          page = await parseWebDocument(html, canonicalUrl);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!page) throw lastError || new Error("网页正文解析失败");
    } catch (error) {
      captureError = error instanceof Error ? error.message : String(error);
      console.error("AI Knowledge OS: webpage capture failed", canonicalUrl, error);
    }

    const title = page?.title || parsed.hostname;
    const description = page?.description || "网页正文暂未读取成功，链接已保留，可稍后重试。";
    const name = safeName(title);
    const tags = inferInboxTags(`${title} ${description} ${page?.markdown?.slice(0, 5000) || ""}`, "网页");
    const existing = this.app.vault.getMarkdownFiles().find((file) => {
      if (!file.path.startsWith(`${ROOT}/00-Inbox/`)) return false;
      return String(this.app.metadataCache.getFileCache(file)?.frontmatter?.source_url || "") === canonicalUrl;
    });
    const existingContent = existing ? await this.app.vault.cachedRead(existing) : "";
    const judgmentMarker = "\n## 我的判断\n";
    const judgmentIndex = existingContent.lastIndexOf(judgmentMarker);
    const judgment = judgmentIndex >= 0
      ? existingContent.slice(judgmentIndex + judgmentMarker.length).trim()
      : "";
    const existingFrontmatter = existing
      ? this.app.metadataCache.getFileCache(existing)?.frontmatter || {}
      : {};
    const capturedAt = existingFrontmatter.captured_at || new Date().toISOString();
    const status = String(existingFrontmatter.status || "pending");
    const metadata = [
      `title: ${yamlQuote(name)}`,
      "type: inbox",
      `status: ${status}`,
      "source: 网页",
      `source_url: ${yamlQuote(canonicalUrl)}`,
      `source_site: ${yamlQuote(page?.site || parsed.hostname)}`,
      page?.author ? `source_author: ${yamlQuote(page.author)}` : "",
      page?.published ? `source_published: ${yamlQuote(page.published)}` : "",
      `capture_status: ${page ? "complete" : "partial"}`,
      `web_parser: ${page?.parser || "fallback"}`,
      page?.wordCount ? `word_count: ${page.wordCount}` : "",
      captureError ? `capture_error: ${yamlQuote(captureError)}` : "",
      `captured_at: ${capturedAt}`,
      `updated_at: ${new Date().toISOString()}`,
      "ai_suggested_tags:",
      ...tags.map((tag) => `  - ${tag}`),
      "tags:",
      "  - inbox",
    ].filter(Boolean).join("\n");
    const sourceDetails = [
      `来源：[${page?.site || parsed.hostname}](${canonicalUrl})`,
      page?.author ? `作者：${page.author}` : "",
      page?.published ? `发布时间：${page.published}` : "",
    ].filter(Boolean).join("  \n");
    const articleBody = page?.markdown
      || `> [!warning] 网页正文未读取成功\n> ${captureError || "该页面可能需要登录、验证码或浏览器执行脚本。"}`;
    const content = `---\n${metadata}\n---\n\n# ${name}\n\n${sourceDetails}\n\n## 摘要\n\n${description}\n\n## 网页正文\n\n${articleBody}\n\n## 我的判断\n\n${judgment}${judgment ? "\n" : ""}`;

    let file;
    if (existing) {
      await this.app.vault.modify(existing, content);
      const desiredPath = normalizePath(`${ROOT}/00-Inbox/${name}.md`);
      if (existing.path !== desiredPath && !this.app.vault.getAbstractFileByPath(desiredPath)) {
        await this.app.fileManager.renameFile(existing, desiredPath);
      }
      file = this.app.vault.getAbstractFileByPath(desiredPath) || existing;
    } else {
      const path = await uniqueVaultPath(this.app, `${ROOT}/00-Inbox/${name}.md`);
      file = await this.app.vault.create(path, content);
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
    new Notice(page ? "网页正文已保存到 Inbox" : "网页链接已保存，但正文解析失败");
  }

  uploadFiles() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      await ensureVaultFolder(this.app, `${ROOT}/00-Inbox/Attachments`);
      for (const sourceFile of files) {
        const attachmentPath = await uniqueVaultPath(this.app, `${ROOT}/00-Inbox/Attachments/${safeName(sourceFile.name)}`);
        await this.app.vault.createBinary(attachmentPath, await sourceFile.arrayBuffer());
        const title = safeName(sourceFile.name.replace(/\.[^.]+$/, ""));
        const notePath = await uniqueVaultPath(this.app, `${ROOT}/00-Inbox/${title}.md`);
        const isImage = /^image\//.test(sourceFile.type);
        const reference = isImage ? `![[${attachmentPath}]]` : `[[${attachmentPath}|打开附件]]`;
        const content = `---\ntitle: "${title.replace(/"/g, "\\\"")}"\ntype: inbox\nstatus: pending\nsource: 上传文件\nfile_type: "${sourceFile.type || "unknown"}"\nfile_size: ${sourceFile.size}\ncaptured_at: ${new Date().toISOString()}\ntags:\n  - inbox\n  - attachment\n---\n\n# ${title}\n\n${reference}\n\n## AI 摘要\n\n等待分析。\n`;
        await this.app.vault.create(notePath, content);
      }
      input.remove();
      new Notice(`已导入 ${files.length} 个文件`);
      await this.render();
    }, { once: true });
    input.click();
  }

  startVoiceCapture(button) {
    if (this.voiceRecognition) {
      this.voiceRecognition.abort();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.openVoiceDictationFallback("当前 Obsidian 不支持浏览器语音识别，已切换为系统听写。");
      return;
    }
    const recognition = new SpeechRecognition();
    this.voiceRecognition = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    button.addClass("is-recording");
    const cleanup = () => {
      button.removeClass("is-recording");
      if (this.voiceRecognition === recognition) this.voiceRecognition = null;
    };
    recognition.onstart = () => new Notice("正在听，请开始说话…再次点击可停止");
    recognition.onerror = (event) => {
      cleanup();
      const error = String(event.error || "unknown");
      console.warn("AI Knowledge OS: speech recognition failed", error, event.message || "");
      if (error === "network") {
        this.openVoiceDictationFallback("在线语音识别服务无法连接，这不是麦克风权限问题。已切换为系统听写。");
      } else if (error === "not-allowed" || error === "service-not-allowed") {
        new Notice("语音输入被系统或识别服务拒绝，请检查 Obsidian 的麦克风与语音识别权限");
      } else if (error === "audio-capture") {
        new Notice("无法读取麦克风，请检查设备是否被占用");
      } else if (error === "no-speech") {
        new Notice("没有检测到语音，请靠近麦克风后重试");
      } else if (error !== "aborted") {
        new Notice(`语音识别失败（${error}），已切换为系统听写`);
        this.openVoiceDictationFallback("浏览器语音识别暂时不可用，已切换为系统听写。");
      }
    };
    recognition.onresult = async (event) => {
      cleanup();
      const transcript = [...event.results].map((result) => result[0].transcript).join(" ").trim();
      if (!transcript) return;
      await this.saveVoiceTranscript(transcript);
    };
    recognition.onend = cleanup;
    try {
      recognition.start();
    } catch (error) {
      cleanup();
      console.error("AI Knowledge OS: unable to start speech recognition", error);
      this.openVoiceDictationFallback("无法启动浏览器语音识别，已切换为系统听写。");
    }
  }

  openVoiceDictationFallback(message) {
    new VoiceDictationModal(this.app, message, async (transcript) => this.saveVoiceTranscript(transcript)).open();
  }

  async saveVoiceTranscript(transcript) {
    const normalized = String(transcript || "").trim();
    if (!normalized) return;
    const title = safeName(normalized.slice(0, 24));
    const path = await uniqueVaultPath(this.app, `${ROOT}/00-Inbox/${title}.md`);
    const content = `---\ntitle: "${title.replace(/"/g, "\\\"")}"\ntype: inbox\nstatus: pending\nsource: 语音记录\ncaptured_at: ${new Date().toISOString()}\ntags:\n  - inbox\n  - voice\n---\n\n# ${title}\n\n${normalized}\n`;
    await this.app.vault.create(path, content);
    new Notice("语音内容已保存到 Inbox");
    await this.render();
  }

  async batchClassify() {
    const items = (await this.getItems()).filter((item) => item.status === "pending");
    if (!items.length) {
      new Notice("当前没有待分类内容");
      return;
    }
    const proposals = items.map((item) => {
      const tags = inferInboxTags(`${item.file.basename} ${item.clean}`, item.source);
      const category = inferInboxCategory(tags);
      const existingTags = normalizeStringArray(item.frontmatter.ai_suggested_tags);
      const changed = JSON.stringify(existingTags) !== JSON.stringify(tags) || String(item.frontmatter.ai_category || "") !== category;
      return { item, tags, category, changed };
    }).filter((proposal) => proposal.changed);
    if (!proposals.length) {
      new Notice("AI 批量分类检查完成，没有需要写入的变化");
      return;
    }
    new ActionConfirmModal(
      this.app,
      "AI 批量分类预览",
      `将更新 ${proposals.length} 条内容。名称保持不变，仅写入分类和标签建议。`,
      proposals.map((proposal) => `${proposal.item.file.basename} → ${proposal.category} · ${proposal.tags.join("、")}`),
      "确认写入",
      async () => {
        const errors = [];
        let updated = 0;
        for (const proposal of proposals) {
          try {
            await this.app.fileManager.processFrontMatter(proposal.item.file, (frontmatter) => {
              frontmatter.ai_suggested_tags = proposal.tags;
              frontmatter.ai_category = proposal.category;
              frontmatter.ai_reviewed = true;
              frontmatter.ai_reviewed_at = new Date().toISOString();
            });
            updated += 1;
          } catch (error) {
            errors.push(`${proposal.item.file.path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        await ensureVaultFolder(this.app, `${ROOT}/Analytics`);
        const date = new Date().toISOString();
        const path = await uniqueVaultPath(this.app, `${ROOT}/Analytics/${date.slice(0, 10)}-Inbox 批量分类报告.md`);
        const report = `---\ntype: inbox-classification-report\ncreated: ${date}\nupdated: ${updated}\nfailed: ${errors.length}\ntags:\n  - report/inbox\n---\n\n# Inbox 批量分类报告\n\n- 更新：${updated}\n- 失败：${errors.length}\n\n## 失败项\n\n${errors.length ? errors.map((error) => `- ${error}`).join("\n") : "- 无"}\n`;
        await this.app.vault.create(path, report);
        new Notice(`AI 批量分类完成：更新 ${updated} 条${errors.length ? `，失败 ${errors.length} 条` : ""}`);
        await this.render();
      },
    ).open();
  }

  relatedLinksFor(item) {
    const text = `${item.file.basename} ${item.clean} ${item.suggested.join(" ")}`;
    const candidates = [];
    if (/agent|claude|codex|智能体/i.test(text)) candidates.push("AI Agent", "FDE");
    if (/客户|企业|方案|需求/i.test(text)) candidates.push("企业 AI 转型", "FDE");
    if (/知识库|rag|检索|向量/i.test(text)) candidates.push("知识库", "AI主题地图");
    return [...new Set(candidates)].filter((name) => this.app.metadataCache.getFirstLinkpathDest(name, item.file.path));
  }

  async saveItem(item) {
    const tags = item.suggested.length ? item.suggested : inferInboxTags(item.clean, item.source);
    const links = this.relatedLinksFor(item);
    await this.app.fileManager.processFrontMatter(item.file, (frontmatter) => {
      frontmatter.status = "processed";
      frontmatter.processed_at = new Date().toISOString();
      frontmatter.ai_category = inferInboxCategory(tags);
      frontmatter.tags = [...new Set([...(Array.isArray(frontmatter.tags) ? frontmatter.tags : []), ...tags.map((tag) => `inbox/${tag}`)])];
      frontmatter.related = [...new Set([...(Array.isArray(frontmatter.related) ? frontmatter.related : []), ...links.map((name) => `[[${name}]]`)])];
    });
    if (links.length && !item.content.includes("## AI 建议关联")) {
      await this.app.vault.append(item.file, `\n## AI 建议关联\n\n${links.map((name) => `- [[${name}]]`).join("\n")}\n`);
    }
    await ensureVaultFolder(this.app, `${ROOT}/Knowledge`);
    const destination = await uniqueVaultPath(this.app, `${ROOT}/Knowledge/${item.file.name}`);
    await this.app.fileManager.renameFile(item.file, destination);
    new Notice(`已保存到知识中心，并添加 ${tags.length} 个标签`);
    await this.render();
  }

  async archiveItem(item) {
    await ensureVaultFolder(this.app, `${ROOT}/00-Inbox/Archive`);
    await this.app.fileManager.processFrontMatter(item.file, (frontmatter) => {
      frontmatter.status = "archived";
      frontmatter.archived_at = new Date().toISOString();
    });
    const destination = await uniqueVaultPath(this.app, `${ROOT}/00-Inbox/Archive/${item.file.name}`);
    await this.app.fileManager.renameFile(item.file, destination);
    new Notice("内容已归档，可在“已归档”中恢复");
    await this.render();
  }

  async restoreItem(item) {
    await this.app.fileManager.processFrontMatter(item.file, (frontmatter) => {
      frontmatter.status = "pending";
      delete frontmatter.archived_at;
    });
    const destination = await uniqueVaultPath(this.app, `${ROOT}/00-Inbox/${item.file.name}`);
    await this.app.fileManager.renameFile(item.file, destination);
    new Notice("内容已恢复到待处理列表");
    await this.render();
  }

  deleteItem(item) {
    new ConfirmModal(this.app, "删除 Inbox 内容？", `“${item.file.basename}”会移动到 Obsidian 本地回收站，可恢复。`, async () => {
      await this.app.vault.trash(item.file, false);
      new Notice("已移动到 Obsidian 回收站");
      await this.render();
    }).open();
  }

  addTag(item) {
    new PromptModal(this.app, "添加标签", "输入一个标签名称，不需要输入 #。", async (tag) => {
      const value = safeName(tag).replace(/\s+/g, "-");
      await this.app.fileManager.processFrontMatter(item.file, (frontmatter) => {
        const tags = Array.isArray(frontmatter.ai_suggested_tags) ? frontmatter.ai_suggested_tags : [];
        frontmatter.ai_suggested_tags = [...new Set([...tags, value])];
      });
      await this.render();
    }, "例如：产品研究", "添加").open();
  }

  async togglePriority(item) {
    await this.app.fileManager.processFrontMatter(item.file, (frontmatter) => {
      frontmatter.priority = !Boolean(frontmatter.priority);
    });
    new Notice(item.priority ? "已取消高价值标记" : "已标记为高价值内容");
    await this.render();
  }

  async markAllReviewed(items) {
    for (const item of items.filter((entry) => entry.status === "pending")) {
      await this.app.fileManager.processFrontMatter(item.file, (frontmatter) => {
        frontmatter.reviewed = true;
        frontmatter.reviewed_at = new Date().toISOString();
      });
    }
    new Notice("全部待处理内容已标记为已读");
    await this.render();
  }

  async exportInbox(items) {
    const date = new Date().toISOString().slice(0, 10);
    const path = await uniqueVaultPath(this.app, `${ROOT}/Analytics/${date}-Inbox 导出.md`);
    const rows = items.map((item) => `| [[${item.file.path.replace(/\.md$/, "")}\|${item.file.basename}]] | ${item.status} | ${item.source} | ${item.suggested.join("、")} |`).join("\n");
    const content = `---\ntitle: "${date} Inbox 导出"\ntype: report\ncreated: ${new Date().toISOString()}\ntags:\n  - report/inbox\n---\n\n# ${date} Inbox 导出\n\n| 内容 | 状态 | 来源 | AI 建议标签 |\n| --- | --- | --- | --- |\n${rows}\n`;
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf("tab").openFile(file);
    new Notice("Inbox 报告已导出");
  }
}

function itemsPercent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

class KnowledgeDashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.refresh = debounce(() => this.render(), 350);
    this.searchResults = null;
    this.copilotCollapsed = false;
    this.aiTitle = "AI Knowledge Agent";
    this.aiMessage = "从你的本地知识中检索、连接与行动。";
    this.dashboardRecentMode = "used";
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return "AI Knowledge OS";
  }

  getIcon() {
    return "brain-circuit";
  }

  async onOpen() {
    this.contentEl.addClass("akos-view-content");
    this.render();
  }

  async onClose() {
    this.contentEl.removeClass("akos-view-content");
  }

  getStats() {
    const files = this.app.vault.getMarkdownFiles();
    const resolved = this.app.metadataCache.resolvedLinks || {};
    let links = 0;
    Object.values(resolved).forEach((targets) => {
      links += Object.keys(targets || {}).length;
    });

    const inbound = new Map(files.map((file) => [file.path, 0]));
    Object.values(resolved).forEach((targets) => {
      Object.keys(targets || {}).forEach((target) => {
        inbound.set(target, (inbound.get(target) || 0) + 1);
      });
    });

    let tasks = 0;
    let bytes = 0;
    const tagCounts = new Map();
    const folderCounts = new Map();
    const categoryCounts = new Map([
      ["AI 技术", 0],
      ["商业模式", 0],
      ["项目案例", 0],
      ["内容资产", 0],
      ["其他", 0],
    ]);
    files.forEach((file) => {
      bytes += file.stat.size;
      const cache = this.app.metadataCache.getFileCache(file);
      (cache?.listItems || []).forEach((item) => {
        if (typeof item.task === "string" && !["x", "X", "-"].includes(item.task)) tasks += 1;
      });
      const folder = file.path.includes("/") ? file.path.split("/")[0] : "根目录";
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      const tags = [];
      (cache?.tags || []).forEach((tag) => tags.push(tag.tag.replace(/^#/, "")));
      const frontmatterTags = cache?.frontmatter?.tags;
      if (Array.isArray(frontmatterTags)) tags.push(...frontmatterTags.map(String));
      else if (typeof frontmatterTags === "string") tags.push(frontmatterTags);
      [...new Set(tags)].forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
      const signature = `${file.path} ${tags.join(" ")} ${cache?.frontmatter?.domain || ""} ${cache?.frontmatter?.type || ""}`.toLowerCase();
      let category = "其他";
      if (/(内容|content|article|script|media|公众号|短视频)/i.test(signature)) category = "内容资产";
      else if (/(projects|project|项目|案例)/i.test(signature)) category = "项目案例";
      else if (/(企业|business|商业|fde|客户)/i.test(signature)) category = "商业模式";
      else if (/(ai|rag|llm|agent|embedding|ocr|知识库|知识工程)/i.test(signature)) category = "AI 技术";
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });

    const orphans = files.filter((file) => {
      const outgoing = Object.keys(resolved[file.path] || {}).length;
      return outgoing === 0 && (inbound.get(file.path) || 0) === 0;
    }).length;
    const recent = [...files].sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 7);
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const folders = [...folderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const categories = [...categoryCounts.entries()];
    const inbox = files.filter((file) => {
      if (file.path === `${ROOT}/00-Inbox/README.md`) return false;
      if (file.path.startsWith(`${ROOT}/00-Inbox/Attachments/`)) return false;
      const cache = this.app.metadataCache.getFileCache(file);
      if (!file.path.startsWith(`${ROOT}/00-Inbox/`) && cache?.frontmatter?.type !== "inbox") return false;
      const status = file.path.includes("/Archive/") ? "archived" : String(cache?.frontmatter?.status || "pending");
      return status === "pending";
    }).length;
    const density = files.length > 1 ? links / (files.length * (files.length - 1)) : 0;

    return { files, links, tasks, bytes, orphans, recent, tags, folders, categories, inbox, density, inbound };
  }

  render() {
    const stats = this.getStats();
    const root = this.contentEl;
    root.empty();
    const app = root.createDiv({ cls: "akos-app" });
    this.renderSidebar(app, stats);
    const center = app.createDiv({ cls: "akos-center" });
    this.renderTopbar(center);
    const scroll = center.createDiv({ cls: "akos-scroll" });
    this.renderHero(scroll, stats);
    this.renderStats(scroll, stats);
    this.renderInsights(scroll, stats);
    this.renderRecent(scroll, stats);
    this.renderGraph(scroll, stats);
    this.renderStatus(center, stats);
    this.renderCopilot(app, stats);
  }

  renderSidebar(app, stats) {
    const sidebar = app.createEl("aside", { cls: "akos-sidebar" });
    const brand = sidebar.createDiv({ cls: "akos-brand" });
    const logo = brand.createDiv({ cls: "akos-logo" });
    logo.createSpan({ cls: "akos-logo-diamond akos-logo-a" });
    logo.createSpan({ cls: "akos-logo-diamond akos-logo-b" });
    const brandText = brand.createDiv();
    brandText.createDiv({ text: "Obsidian AI", cls: "akos-brand-title" });
    brandText.createDiv({ text: "Knowledge OS", cls: "akos-brand-subtitle" });

    const mainLabel = sidebar.createDiv({ text: "MAIN", cls: "akos-nav-label" });
    mainLabel.setAttr("aria-label", "主导航");
    const items = [
      ["Dashboard", "知识驾驶舱", "layout-dashboard", () => this.plugin.router.navigate("dashboard"), true],
      ["Inbox", "未整理信息", "inbox", () => this.plugin.router.navigate("inbox"), false, stats.inbox],
      ["Knowledge", "知识中心", "book-open", () => this.plugin.router.navigate("knowledge")],
      ["Graph", "知识网络", "share-2", () => this.plugin.router.navigate("graph")],
      ["Projects", "项目管理", "folder-kanban", () => this.plugin.router.navigate("projects")],
      ["AI Agents", "智能体中心", "bot", () => this.plugin.router.navigate("agents")],
      ["Analytics", "数据分析", "chart-no-axes-combined", () => this.plugin.router.navigate("analytics")],
    ];
    const nav = sidebar.createEl("nav", { cls: "akos-nav" });
    items.forEach(([title, subtitle, icon, action, active, badge]) => {
      const button = nav.createEl("button", { cls: `akos-nav-item${active ? " is-active" : ""}` });
      createIcon(button, icon);
      const copy = button.createDiv({ cls: "akos-nav-copy" });
      copy.createDiv({ text: title, cls: "akos-nav-title" });
      copy.createDiv({ text: subtitle, cls: "akos-nav-subtitle" });
      if (badge) button.createSpan({ text: String(badge), cls: "akos-nav-badge" });
      button.addEventListener("click", action);
    });

    sidebar.createDiv({ cls: "akos-sidebar-rule" });
    sidebar.createDiv({ text: "SYSTEM", cls: "akos-nav-label" });
    const system = sidebar.createDiv({ cls: "akos-nav" });
    const templates = createButton(system, "Templates", "notebook-tabs", "akos-nav-compact");
    templates.addEventListener("click", () => this.openFolder(`${ROOT}/Templates`));
    const settings = createButton(system, "Settings", "settings", "akos-nav-compact");
    settings.addEventListener("click", () => this.plugin.openSettings());

    const vaultCard = sidebar.createDiv({ cls: "akos-vault-card" });
    const vaultTitle = vaultCard.createDiv({ cls: "akos-vault-card-title" });
    vaultTitle.createSpan({ text: "知识库状态" });
    createIcon(vaultTitle, "activity");
    const rows = [
      ["总笔记数", formatNumber(stats.files.length)],
      ["总链接数", formatNumber(stats.links)],
      ["文本大小", formatSize(stats.bytes)],
      ["孤立笔记", formatNumber(stats.orphans)],
    ];
    rows.forEach(([label, value]) => {
      const row = vaultCard.createDiv({ cls: "akos-vault-row" });
      row.createSpan({ text: label });
      row.createEl("strong", { text: value });
    });
    const meter = vaultCard.createDiv({ cls: "akos-meter" });
    meter.createSpan({ attr: { style: `width:${Math.min(100, Math.max(12, (1 - stats.orphans / Math.max(1, stats.files.length)) * 100))}%` } });
    const live = vaultCard.createDiv({ cls: "akos-live" });
    live.createSpan();
    live.createSpan({ text: "本地索引已连接" });
  }

  renderTopbar(center) {
    const topbar = center.createDiv({ cls: "akos-topbar" });
    const searchWrap = topbar.createDiv({ cls: "akos-search" });
    createIcon(searchWrap, "search");
    const search = searchWrap.createEl("input", {
      type: "search",
      placeholder: "搜索知识库…",
      attr: { "aria-label": "搜索知识库" },
    });
    search.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" && search.value.trim()) {
        await this.runKnowledgeSearch(search.value.trim());
      }
    });
    searchWrap.createSpan({ text: "⌘ K", cls: "akos-shortcut" });
    const actions = topbar.createDiv({ cls: "akos-top-actions" });
    const ai = createButton(actions, "AI 助手", "sparkles", "akos-top-action");
    ai.addEventListener("click", () => this.focusPrompt());
    const insight = createButton(actions, "今日洞察", "lightbulb", "akos-top-action");
    insight.addEventListener("click", () => document.querySelector(".akos-insights")?.scrollIntoView({ behavior: "smooth" }));
    const add = createButton(actions, "", "square-pen", "akos-icon-button");
    add.setAttr("aria-label", "新建笔记");
    add.addEventListener("click", () => this.createInboxNote());
    const avatar = actions.createEl("button", { cls: "akos-avatar-button" });
    avatar.createSpan({ text: (this.plugin.settings.userName || "E").charAt(0).toUpperCase(), cls: "akos-avatar" });
    avatar.createSpan({ text: this.plugin.settings.userName || "Ethan" });
    createIcon(avatar, "chevron-down");
    avatar.addEventListener("click", () => this.plugin.openSettings());
  }

  renderHero(parent) {
    const hero = parent.createDiv({ cls: "akos-hero" });
    const copy = hero.createDiv();
    copy.createEl("h1", { text: `${greeting()}, ${this.plugin.settings.userName} 👋` });
    copy.createEl("p", { text: "欢迎回来！你的知识系统正在帮助你变得更强大。" });
    const date = hero.createDiv({ cls: "akos-date" });
    createIcon(date, "calendar-days");
    date.createSpan({
      text: new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    });
  }

  renderStats(parent, stats) {
    const grid = parent.createDiv({ cls: "akos-stat-grid" });
    const cards = [
      ["新增知识", stats.files.filter((f) => Date.now() - f.stat.ctime < 86400000).length, "sparkles", "violet", "最近 24 小时"],
      ["建立连接", stats.links, "link-2", "blue", `网络密度 ${(stats.density * 100).toFixed(2)}%`],
      ["待办任务", stats.tasks, "bot", "cyan", "来自全部笔记"],
      ["待整理", stats.inbox, "flame", "orange", "Inbox 中的内容"],
    ];
    cards.forEach(([label, value, icon, color, foot]) => {
      const card = grid.createDiv({ cls: "akos-stat-card" });
      createIcon(card, icon, `akos-stat-icon is-${color}`);
      const copy = card.createDiv({ cls: "akos-stat-copy" });
      copy.createDiv({ text: label, cls: "akos-stat-label" });
      copy.createEl("strong", { text: formatNumber(value), cls: "akos-stat-value" });
      copy.createDiv({ text: foot, cls: "akos-stat-foot" });
    });
  }

  renderInsights(parent, stats) {
    const section = parent.createEl("section", { cls: "akos-section akos-insights" });
    const heading = section.createDiv({ cls: "akos-section-heading" });
    heading.createEl("h2", { text: "今日洞察" });
    heading.createSpan({ text: "基于本地知识网络实时分析" });
    const body = section.createDiv({ cls: "akos-insight-body" });
    const lead = body.createDiv({ cls: "akos-insight-lead" });
    createIcon(lead, "wand-sparkles", "akos-insight-symbol");
    lead.createEl("h3", { text: `发现 ${Math.min(3, Math.max(1, stats.orphans))} 个值得加强的连接` });
    lead.createEl("p", { text: stats.orphans ? `当前有 ${stats.orphans} 篇孤立笔记。先给高价值笔记补上项目或概念链接。` : "知识网络连接良好，可以开始提炼跨领域洞察。" });
    const detail = createButton(lead, "查看知识网络", "arrow-right", "akos-primary-soft");
    detail.addEventListener("click", () => this.plugin.router.navigate("graph"));

    const list = body.createDiv({ cls: "akos-connection-list" });
    const connections = [
      ["FDE 模式", "企业 AI 转型", "落地角色", "purple"],
      ["AI Agent", "自动化工作流", "执行链路", "blue"],
      ["知识库", "组织生产力", "知识底座", "cyan"],
    ];
    connections.forEach(([from, to, reason, color]) => {
      const row = list.createDiv({ cls: "akos-connection" });
      createIcon(row, "git-branch", `akos-connection-icon is-${color}`);
      const copy = row.createDiv({ cls: "akos-connection-copy" });
      copy.createEl("strong", { text: from });
      const line = copy.createDiv({ cls: "akos-connection-line" });
      line.createSpan();
      line.createEl("i");
      line.createSpan();
      copy.createEl("strong", { text: to });
      row.createSpan({ text: reason, cls: "akos-chip" });
      row.addEventListener("click", () => this.openByName(from.replace(" 模式", "")));
    });
  }

  renderRecent(parent, stats) {
    const section = parent.createEl("section", { cls: "akos-section akos-recent" });
    const heading = section.createDiv({ cls: "akos-section-heading akos-section-heading-tabs" });
    const tabs = heading.createDiv({ cls: "akos-tabs" });
    [["used", "最近使用"], ["edited", "最近编辑"], ["created", "最近创建"], ["visited", "最常访问"]].forEach(([mode, label]) => {
      const tab = tabs.createEl("button", { text: label, cls: this.dashboardRecentMode === mode ? "is-active" : "" });
      if (mode === "visited") bindPlannedFeature(tab, "最常访问统计");
      else tab.addEventListener("click", () => { this.dashboardRecentMode = mode; this.render(); });
    });
    const all = createButton(heading, "查看全部", "arrow-right", "akos-link-button");
    all.addEventListener("click", () => this.app.commands.executeCommandById("switcher:open"));
    const list = section.createDiv({ cls: "akos-recent-list" });
    const recentFiles = [...stats.files].sort(this.dashboardRecentMode === "created"
      ? (a, b) => b.stat.ctime - a.stat.ctime
      : (a, b) => b.stat.mtime - a.stat.mtime);
    recentFiles.slice(0, 5).forEach((file, index) => {
      const row = list.createEl("button", { cls: "akos-recent-row" });
      createIcon(row, index % 3 === 0 ? "file-text" : index % 3 === 1 ? "file-check-2" : "notebook-text", `akos-file-icon is-${index % 4}`);
      row.createSpan({ text: file.basename, cls: "akos-recent-name" });
      const cache = this.app.metadataCache.getFileCache(file);
      const tag = cache?.frontmatter?.domain || cache?.frontmatter?.type || file.parent?.name;
      if (tag) row.createSpan({ text: String(tag), cls: "akos-chip" });
      row.createSpan({ text: formatRelativeTime(file.stat.mtime), cls: "akos-recent-time" });
      row.addEventListener("click", () => this.openFile(file.path));
    });
  }

  renderGraph(parent, stats) {
    const section = parent.createEl("section", { cls: "akos-section akos-graph-section" });
    const heading = section.createDiv({ cls: "akos-section-heading" });
    heading.createEl("h2", { text: "知识图谱概览" });
    const open = createButton(heading, "打开 Canvas", "maximize-2", "akos-link-button");
    open.addEventListener("click", () => this.openFile(`${ROOT}/Knowledge Map.canvas`));
    const grid = section.createDiv({ cls: "akos-graph-grid" });
    const legend = grid.createDiv({ cls: "akos-legend" });
    const colors = ["purple", "cyan", "orange", "blue", "gray"];
    stats.categories.forEach(([label, count], index) => {
      const item = legend.createDiv({ cls: "akos-legend-row" });
      item.createSpan({ cls: `akos-dot is-${colors[index]}` });
      item.createSpan({ text: label });
      item.createEl("strong", { text: formatNumber(count) });
    });
    const network = grid.createDiv({ cls: "akos-network" });
    this.renderNetwork(network);
    const metrics = grid.createDiv({ cls: "akos-graph-metrics" });
    const metricA = metrics.createDiv({ cls: "akos-graph-metric" });
    metricA.createSpan({ text: "知识网络密度" });
    metricA.createEl("strong", { text: stats.density.toFixed(3) });
    metricA.createEl("small", { text: "链接 / 最大可能连接" });
    const metricB = metrics.createDiv({ cls: "akos-graph-metric" });
    metricB.createSpan({ text: "核心节点" });
    metricB.createEl("strong", { text: formatNumber(Math.max(1, stats.tags.length)) });
    metricB.createEl("small", { text: "高频主题标签" });
  }

  renderNetwork(parent) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 420 220");
    svg.setAttribute("class", "akos-network-svg");
    parent.appendChild(svg);
    const points = [
      [210, 110, 10, "#7565ff"], [118, 58, 5, "#8b7cff"], [305, 45, 6, "#55d9ff"],
      [340, 135, 5, "#55d9ff"], [275, 190, 5, "#9d7cff"], [130, 180, 6, "#8b7cff"],
      [55, 120, 4, "#55d9ff"], [188, 35, 4, "#ff9b69"], [365, 82, 3, "#8b7cff"],
      [78, 34, 3, "#55d9ff"], [36, 175, 3, "#8b7cff"], [384, 184, 4, "#55d9ff"],
      [230, 175, 3, "#55d9ff"], [165, 145, 3, "#ff9b69"], [258, 73, 4, "#8b7cff"],
    ];
    const lines = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,12],[0,13],[0,14],[1,6],[1,7],[1,9],[1,13],[2,8],[2,14],[2,3],[3,8],[3,11],[3,4],[4,11],[4,12],[4,5],[5,6],[5,10],[5,13],[6,9],[6,10],[7,9],[7,14],[12,13],[12,11],[13,14]];
    lines.forEach(([a, b]) => {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", points[a][0]); line.setAttribute("y1", points[a][1]);
      line.setAttribute("x2", points[b][0]); line.setAttribute("y2", points[b][1]);
      line.setAttribute("class", "akos-network-line");
      svg.appendChild(line);
    });
    points.forEach(([x, y, r, color], index) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", r);
      circle.setAttribute("fill", color); circle.setAttribute("class", index === 0 ? "akos-core-node" : "akos-network-node");
      svg.appendChild(circle);
    });
  }

  renderCopilot(app, stats) {
    const aside = app.createEl("aside", { cls: "akos-copilot" });
    app.toggleClass("is-copilot-collapsed", this.copilotCollapsed);
    aside.toggleClass("is-collapsed", this.copilotCollapsed);
    const header = aside.createDiv({ cls: "akos-copilot-header" });
    const title = header.createDiv({ cls: "akos-copilot-title" });
    createIcon(title, "sparkles");
    title.createEl("strong", { text: "AI Knowledge Agent" });
    const toggle = createButton(
      header,
      "",
      this.copilotCollapsed ? "panel-left-open" : "panel-right-close",
      "akos-icon-button akos-assistant-toggle"
    );
    toggle.setAttr("aria-label", this.copilotCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.setAttr("title", this.copilotCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.addEventListener("click", () => {
      this.copilotCollapsed = !this.copilotCollapsed;
      this.render();
    });
    const scroll = aside.createDiv({ cls: "akos-copilot-scroll" });
    const intro = scroll.createDiv({ cls: "akos-copilot-intro" });
    intro.createEl("h2", { text: `你好，${this.plugin.settings.userName} 👋` });
    intro.createEl("p", { text: this.aiMessage });

    const suggestions = scroll.createDiv({ cls: "akos-suggestions" });
    [
      ["总结当前笔记内容", "notebook-text", () => this.summarizeCurrent()],
      ["查找相关知识和关联", "blocks", () => this.findRelated()],
      ["生成文章或报告", "square-pen", () => this.createArticle()],
      ["为项目生成方案", "folder-kanban", () => this.createProject()],
      ["分析知识库趋势", "chart-no-axes-combined", () => this.showTrends(stats)],
    ].forEach(([label, icon, action]) => {
      const button = createButton(suggestions, label, icon, "akos-suggestion");
      button.addEventListener("click", action);
    });

    const response = scroll.createDiv({ cls: `akos-ai-response${this.searchResults ? " is-visible" : ""}` });
    if (this.searchResults) {
      response.createDiv({ text: this.aiTitle, cls: "akos-ai-response-title" });
      if (typeof this.searchResults === "string") {
        response.createEl("p", { text: this.searchResults });
      } else {
        this.searchResults.forEach((result) => {
          const row = response.createEl("button", { cls: "akos-search-result" });
          const copy = row.createDiv();
          copy.createEl("strong", { text: result.file.basename });
          copy.createEl("p", { text: result.snippet });
          row.createSpan({ text: String(result.score), cls: "akos-score" });
          row.addEventListener("click", () => this.openFile(result.file.path));
        });
      }
    }

    const context = scroll.createDiv({ cls: "akos-context" });
    context.createEl("h3", { text: "当前上下文" });
    const contextCard = context.createDiv({ cls: "akos-context-card" });
    contextCard.createDiv({ text: "知识库概览", cls: "akos-context-label" });
    const contextGrid = contextCard.createDiv({ cls: "akos-context-grid" });
    [
      [formatNumber(stats.files.length), "笔记数量", "notebook-text", "purple"],
      [formatNumber(stats.links), "链接数量", "link-2", "blue"],
      [formatNumber(stats.tasks), "待办任务", "circle-check-big", "orange"],
      [formatSize(stats.bytes), "文本大小", "database", "cyan"],
    ].forEach(([value, label, icon, color]) => {
      const cell = contextGrid.createDiv({ cls: "akos-context-cell" });
      createIcon(cell, icon, `is-${color}`);
      const copy = cell.createDiv();
      copy.createEl("strong", { text: value });
      copy.createSpan({ text: label });
    });
    contextCard.createDiv({ text: "活跃标签", cls: "akos-context-label akos-context-label-tags" });
    const tags = contextCard.createDiv({ cls: "akos-tags" });
    (stats.tags.length ? stats.tags : [["AI Agent", 1], ["知识库", 1], ["FDE", 1]]).slice(0, 7).forEach(([tag, count]) => {
      const chip = tags.createEl("button", { text: `#${tag}`, cls: "akos-tag" });
      chip.setAttr("title", `${count} 篇笔记`);
      chip.addEventListener("click", () => this.runKnowledgeSearch(String(tag)));
    });

    const composer = aside.createDiv({ cls: "akos-composer" });
    const input = composer.createEl("textarea", {
      attr: { rows: "2", placeholder: "Ask your knowledge…", "aria-label": "询问你的知识库" },
      cls: "akos-prompt",
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const query = input.value.trim();
        if (query) this.runKnowledgeSearch(query);
      }
    });
    const composerActions = composer.createDiv({ cls: "akos-composer-actions" });
    const attach = createButton(composerActions, "", "paperclip", "akos-icon-button");
    attach.setAttr("aria-label", "使用当前笔记作为上下文");
    attach.addEventListener("click", () => this.summarizeCurrent());
    const local = createButton(composerActions, "本地检索", "scan-search", "akos-mode-button");
    local.addEventListener("click", () => {
      const query = input.value.trim();
      if (query) this.runKnowledgeSearch(query);
    });
    const send = createButton(composerActions, "", "send-horizontal", "akos-send");
    send.setAttr("aria-label", "搜索知识库");
    send.addEventListener("click", () => {
      const query = input.value.trim();
      if (query) this.runKnowledgeSearch(query);
    });
    const deep = createButton(composer, "交给 Claudian 深度处理", "bot", "akos-deep-ai");
    deep.addEventListener("click", () => this.openClaudian(input.value.trim() || "请基于当前 Obsidian 知识库分析最值得推进的下一步。"));
    composer.createDiv({ text: "先本地检索，再决定是否调用 AI；内容始终保存在 Vault 中。", cls: "akos-composer-note" });
  }

  renderStatus(center, stats) {
    const bar = center.createDiv({ cls: "akos-status" });
    bar.createSpan({ text: `Vault: ${this.app.vault.getName()}` });
    bar.createEl("i");
    bar.createSpan({ text: `${formatNumber(stats.files.length)} 篇笔记` });
    bar.createSpan({ text: `${formatNumber(stats.links)} 条连接` });
    bar.createSpan({ text: "主题：Obsidian Dark" });
    const model = bar.createSpan({ cls: "akos-status-model" });
    model.createEl("i");
    model.createSpan({ text: "Claudian · Local Vault" });
  }

  async openFile(path) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    if (!file) {
      new Notice(`未找到：${path}`);
      return;
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  async openByName(name) {
    const file = this.app.metadataCache.getFirstLinkpathDest(name, "") || this.app.vault.getMarkdownFiles().find((item) => item.basename === name);
    if (file) await this.app.workspace.getLeaf("tab").openFile(file);
  }

  openFolder(path) {
    const explorer = this.app.workspace.getLeavesOfType("file-explorer")[0];
    if (!explorer) {
      new Notice("文件管理器未启用，无法定位目录");
      return;
    }
    void this.app.workspace.revealLeaf(explorer);
    const folder = this.app.vault.getAbstractFileByPath(path);
    const item = explorer.view?.fileItems?.[path];
    if (folder && item) {
      item.setCollapsed?.(false);
      item.el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      item.el?.addClass?.("is-flashing");
      window.setTimeout(() => item.el?.removeClass?.("is-flashing"), 1200);
      new Notice(`已定位：${path}`);
    } else {
      new Notice(`目录不存在：${path}`);
    }
  }

  async focusPrompt() {
    if (this.copilotCollapsed) {
      this.copilotCollapsed = false;
      await this.render();
    }
    this.contentEl.querySelector(".akos-copilot")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const input = this.contentEl.querySelector(".akos-prompt");
    input?.focus();
  }

  async runKnowledgeSearch(query) {
    const words = query.toLowerCase().split(/[\s，。；、]+/).filter(Boolean);
    const results = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const text = await this.app.vault.cachedRead(file);
      const haystack = `${file.basename}\n${text}`.toLowerCase();
      let score = 0;
      words.forEach((word) => {
        if (file.basename.toLowerCase().includes(word)) score += 8;
        const matches = haystack.split(word).length - 1;
        score += Math.min(matches, 8);
      });
      if (score > 0) {
        const clean = cleanMarkdown(text);
        const firstWord = words.find((word) => clean.toLowerCase().includes(word));
        const position = firstWord ? clean.toLowerCase().indexOf(firstWord) : 0;
        const start = Math.max(0, position - 45);
        results.push({ file, score, snippet: clean.slice(start, start + 115) || "打开笔记查看内容" });
      }
    }
    results.sort((a, b) => b.score - a.score || b.file.stat.mtime - a.file.stat.mtime);
    this.aiTitle = `“${query}” 的本地结果`;
    this.aiMessage = results.length ? `找到 ${results.length} 篇相关笔记，以下是最相关的内容。` : "当前知识库没有直接匹配。可以交给 Claudian 扩展分析。";
    this.searchResults = results.slice(0, 5);
    this.render();
    window.setTimeout(() => this.contentEl.querySelector(".akos-ai-response")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }

  getContextFile() {
    const active = this.app.workspace.getActiveFile();
    if (active) this.plugin.lastFile = active;
    return active || this.plugin.lastFile || null;
  }

  async summarizeCurrent() {
    const file = this.getContextFile();
    if (!file) {
      this.aiTitle = "没有当前笔记";
      this.aiMessage = "先打开一篇笔记，再回到驾驶舱使用总结。";
      this.searchResults = "尚未捕获可总结的笔记。";
      this.render();
      return;
    }
    const content = cleanMarkdown(await this.app.vault.cachedRead(file));
    const sentences = content.split(/(?<=[。！？.!?])\s*/).filter((sentence) => sentence.length > 12);
    const summary = sentences.slice(0, 4).join(" ").slice(0, 420) || content.slice(0, 420);
    this.aiTitle = `${file.basename} · 快速摘要`;
    this.aiMessage = "这是本地提取式摘要；需要综合推理时可交给 Claudian。";
    this.searchResults = summary || "这篇笔记暂时没有可摘要的正文。";
    this.render();
  }

  async findRelated() {
    const file = this.getContextFile();
    if (!file) {
      this.aiTitle = "关联知识";
      this.aiMessage = "先打开一篇笔记，我会根据双链查找上下游。";
      this.searchResults = "当前没有选中的笔记。";
      this.render();
      return;
    }
    const resolved = this.app.metadataCache.resolvedLinks || {};
    const relatedPaths = new Set(Object.keys(resolved[file.path] || {}));
    Object.entries(resolved).forEach(([source, targets]) => {
      if (targets?.[file.path]) relatedPaths.add(source);
    });
    const related = [...relatedPaths]
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((item) => item instanceof TFile)
      .slice(0, 8)
      .map((item, index) => ({ file: item, score: Math.max(1, 8 - index), snippet: `与「${file.basename}」存在直接 Wikilink 关系。` }));
    this.aiTitle = `${file.basename} · 关联知识`;
    this.aiMessage = related.length ? `找到 ${related.length} 个直接关联。` : "没有直接双链，建议为它连接一个概念或项目。";
    this.searchResults = related;
    this.render();
  }

  createInboxNote() {
    new PromptModal(this.app, "新建 Inbox 笔记", "先快速收集，之后再判断它属于知识、项目还是内容。", async (title) => {
      const name = safeName(title);
      const path = await this.uniquePath(`${ROOT}/00-Inbox/${name}.md`);
      const content = `---\ntitle: "${name.replace(/\"/g, "\\\"")}"\ncreated: ${new Date().toISOString()}\nstatus: inbox\ntags:\n  - inbox\n---\n\n# ${name}\n\n## 原始信息\n\n\n## 为什么值得保留\n\n\n## 下一步\n\n- [ ] 判断归属并建立 Wikilink\n`;
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf("tab").openFile(file);
    }).open();
  }

  createArticle() {
    new PromptModal(this.app, "生成内容草稿", "输入主题。我会创建带知识库引用入口的结构化草稿。", async (title) => {
      const name = safeName(title);
      const path = await this.uniquePath(`${ROOT}/00-Inbox/${new Date().toISOString().slice(0, 10)}-${name}-内容草稿.md`);
      const context = this.getContextFile();
      const content = `---\ntitle: "${name.replace(/\"/g, "\\\"")}"\ntype: content\nstatus: draft\ncreated: ${new Date().toISOString()}\ntags:\n  - content/draft\n---\n\n# ${name}\n\n> [!info] 写作任务\n> 基于知识库形成有证据、有立场的内容。${context ? `起点：[[${context.path.replace(/\.md$/, "")}]]` : ""}\n\n## 受众与问题\n\n## 核心判断\n\n## 证据与案例\n\n## 结构\n\n## 成稿\n\n## 引用笔记\n\n`;
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf("tab").openFile(file);
      new Notice("内容草稿已创建");
    }).open();
  }

  createProject() {
    new PromptModal(this.app, "创建项目方案", "输入项目名。新项目会自动进入 Projects Base。", async (title) => {
      const name = safeName(title);
      const path = await this.uniquePath(`${ROOT}/Projects/${name}.md`);
      const content = `---\ntitle: "${name.replace(/\"/g, "\\\"")}"\ntype: project\nstatus: planning\nprogress: 0\nnext_action: 明确可验收目标\ndue:\ntags:\n  - project/active\n---\n\n# ${name}\n\n> [!info] 项目目标\n> 写成可验收的结果，而不是活动描述。\n\n## 成功标准\n\n- [ ] \n\n## 关联知识\n\n## 下一步\n\n- [ ] 明确可验收目标\n\n## 决策记录\n\n`;
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf("tab").openFile(file);
      new Notice("项目已创建，并已进入项目 Base");
    }).open();
  }

  showTrends(stats) {
    const topTags = stats.tags.slice(0, 5).map(([tag, count]) => `#${tag}（${count}）`).join("、") || "暂无标签";
    const topFolders = stats.folders.slice(0, 4).map(([folder, count]) => `${folder}（${count}）`).join("、");
    this.aiTitle = "知识库趋势";
    this.aiMessage = "基于当前文件、链接和标签的本地统计。";
    this.searchResults = `高频标签：${topTags}。内容主要分布在：${topFolders}。当前有 ${stats.orphans} 篇孤立笔记、${stats.tasks} 个未完成任务。`;
    this.render();
  }

  async openClaudian(prompt) {
    return this.plugin.runClaudianPrompt(prompt);
  }

  async uniquePath(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const ext = path.endsWith(".md") ? ".md" : "";
    const base = ext ? path.slice(0, -3) : path;
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(`${base}-${index}${ext}`)) index += 1;
    return `${base}-${index}${ext}`;
  }
}

const KNOWLEDGE_DOMAINS = [
  { name: "AI技术", icon: "zap", color: "purple", description: "AI 理论、算法与实践", pattern: /(ai|agent|rag|llm|模型|算法|智能体|知识库|embedding)/i },
  { name: "商业模式", icon: "briefcase-business", color: "blue", description: "商业洞察与增长策略", pattern: /(商业|business|增长|战略|营收|模式|企业转型)/i },
  { name: "项目案例", icon: "rocket", color: "cyan", description: "项目实践与客户案例", pattern: /(project|项目|案例|客户|方案|交付|fde)/i },
  { name: "人脉资源", icon: "users-round", color: "orange", description: "人物、组织与合作关系", pattern: /(人物|人脉|联系人|组织|团队|伙伴|contact|people)/i },
  { name: "内容素材", icon: "messages-square", color: "pink", description: "选题、文稿与内容资产", pattern: /(内容|文章|公众号|视频|脚本|选题|素材|content)/i },
  { name: "学习资料", icon: "graduation-cap", color: "green", description: "学习资源与课程资料", pattern: /(学习|课程|论文|书籍|研究|资料|learning)/i },
];

class KnowledgeCenterView extends KnowledgeDashboardView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.knowledgeTab = "all";
    this.knowledgeDomain = "all";
    this.knowledgeQuery = "";
    this.knowledgeSort = "recent";
    this.selectedCollection = null;
    this.renderVersion = 0;
    this.nativeGraphLeaf = null;
    this.nativeGraphReady = null;
    this.nativeGraphHost = null;
    this.refresh = debounce(() => this.render(), 350);
  }

  getViewType() {
    return KNOWLEDGE_VIEW_TYPE;
  }

  getDisplayText() {
    return "Knowledge Center · AI Knowledge OS";
  }

  getIcon() {
    return "book-open";
  }

  async onOpen() {
    this.contentEl.addClass("akos-view-content", "akos-knowledge-view-content");
    await this.render();
  }

  async onClose() {
    this.nativeGraphHost = null;
    if (this.nativeGraphLeaf) {
      this.nativeGraphLeaf.detach();
      this.nativeGraphLeaf = null;
      this.nativeGraphReady = null;
    }
    this.contentEl.removeClass("akos-view-content", "akos-knowledge-view-content");
  }

  classifyKnowledge(file, tags, content, frontmatter) {
    const relativePath = file.path.replace(new RegExp(`^${ROOT}/?`, "i"), "");
    const metadata = `${relativePath} ${tags.join(" ")} ${frontmatter.domain || ""} ${frontmatter.type || ""}`;
    const signature = `${metadata} ${content.slice(0, 1800)}`;
    if (/(^|\W)(project|项目|案例|客户|交付)(\W|$)/i.test(metadata)) return "项目案例";
    if (/(^|\W)(content|文章|公众号|视频|脚本|选题|素材)(\W|$)/i.test(metadata)) return "内容素材";
    if (/(人物|人脉|联系人|组织|团队|伙伴|contact|people)/i.test(metadata)) return "人脉资源";
    if (/(学习|课程|论文|书籍|研究|资料|learning)/i.test(metadata)) return "学习资料";
    if (/(商业|business|增长|战略|营收|模式|企业转型)/i.test(signature)) return "商业模式";
    if (/(ai|agent|rag|llm|模型|算法|智能体|知识库|embedding)/i.test(signature)) return "AI技术";
    return "学习资料";
  }

  async getKnowledgeData() {
    const base = this.getStats();
    const resolved = this.app.metadataCache.resolvedLinks || {};
    const inbound = new Map(base.files.map((file) => [file.path, 0]));
    Object.values(resolved).forEach((targets) => {
      Object.keys(targets || {}).forEach((path) => inbound.set(path, (inbound.get(path) || 0) + 1));
    });
    const notes = await Promise.all(base.files.map(async (file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter || {};
      const content = await this.app.vault.cachedRead(file);
      const tags = [];
      (cache?.tags || []).forEach((tag) => tags.push(tag.tag.replace(/^#/, "")));
      const fmTags = frontmatter.tags;
      if (Array.isArray(fmTags)) tags.push(...fmTags.map(String));
      else if (typeof fmTags === "string") tags.push(fmTags);
      const uniqueTags = [...new Set(tags)].filter((tag) => tag !== "inbox");
      const category = this.classifyKnowledge(file, uniqueTags, content, frontmatter);
      const outgoing = Object.keys(resolved[file.path] || {}).length;
      return {
        file,
        frontmatter,
        tags: uniqueTags,
        category,
        snippet: cleanMarkdown(content).slice(0, 145) || "这篇笔记还没有正文摘要。",
        links: outgoing + (inbound.get(file.path) || 0),
        favorite: Boolean(frontmatter.favorite || uniqueTags.some((tag) => /favorite|收藏/i.test(tag))),
        source: String(frontmatter.source || (file.path.startsWith(`${ROOT}/Knowledge/`) ? "知识库" : "内部笔记")),
      };
    }));
    const domainCounts = new Map(KNOWLEDGE_DOMAINS.map((domain) => [domain.name, 0]));
    notes.forEach((note) => domainCounts.set(note.category, (domainCounts.get(note.category) || 0) + 1));
    const tagCounts = new Map();
    notes.forEach((note) => note.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayAdded = notes.filter((note) => note.file.stat.ctime >= todayStart.getTime()).length;
    const meaningfulTags = tags.filter(([tag]) => !/(^|\/)(system|template|inbox|类型|状态)(\/|$)/i.test(tag));
    const collections = meaningfulTags.slice(0, 4).map(([name]) => {
      const items = notes.filter((note) => note.tags.includes(name));
      return {
        name,
        items,
        links: items.reduce((sum, item) => sum + item.links, 0),
        updated: Math.max(...items.map((item) => item.file.stat.mtime)),
      };
    });
    return { base, notes, domainCounts, tags, todayAdded, collections };
  }

  async render() {
    const version = ++this.renderVersion;
    const data = await this.getKnowledgeData();
    if (version !== this.renderVersion) return;
    const root = this.contentEl;
    root.empty();
    const app = root.createDiv({ cls: "akos-app akos-knowledge-app" });
    this.renderKnowledgeSidebar(app, data);
    const center = app.createDiv({ cls: "akos-center akos-knowledge-center" });
    this.renderKnowledgeTopbar(center, data);
    const scroll = center.createDiv({ cls: "akos-scroll akos-knowledge-scroll" });
    this.renderKnowledgeHeader(scroll, data);
    this.renderKnowledgeStats(scroll, data);
    this.renderKnowledgeDomains(scroll, data);
    this.renderKnowledgeLibrary(scroll, data);
    this.renderKnowledgeBottom(scroll, data);
    this.renderStatus(center, data.base);
    this.renderKnowledgeAssistant(app, data);
  }

  renderKnowledgeSidebar(app, data) {
    super.renderSidebar(app, data.base);
    app.querySelectorAll(".akos-nav-item").forEach((button) => {
      const title = button.querySelector(".akos-nav-title")?.textContent;
      button.toggleClass("is-active", title === "Knowledge");
    });
  }

  renderKnowledgeTopbar(center, data) {
    const topbar = center.createDiv({ cls: "akos-topbar" });
    const searchWrap = topbar.createDiv({ cls: "akos-search akos-knowledge-search" });
    createIcon(searchWrap, "search");
    const search = searchWrap.createEl("input", {
      attr: { type: "search", placeholder: "搜索知识库、笔记、标签…", "aria-label": "搜索知识库" },
    });
    search.value = this.knowledgeQuery;
    search.addEventListener("input", () => {
      this.knowledgeQuery = search.value.trim().toLowerCase();
      this.applyKnowledgeFilter();
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && search.value.trim()) this.runKnowledgeSearch(search.value.trim());
    });
    searchWrap.createSpan({ text: "⌘ K", cls: "akos-shortcut" });
    const actions = topbar.createDiv({ cls: "akos-top-actions" });
    const ai = createButton(actions, "AI 助手", "sparkles", "akos-top-action");
    ai.addEventListener("click", () => this.focusPrompt());
    const insight = createButton(actions, "今日洞察", "lightbulb", "akos-top-action");
    insight.addEventListener("click", () => this.showKnowledgeInsight(data));
    const add = createButton(actions, "", "square-pen", "akos-icon-button");
    add.setAttr("aria-label", "新建知识笔记");
    add.addEventListener("click", () => this.createKnowledgeNote());
    const avatar = actions.createEl("button", { cls: "akos-avatar-button" });
    avatar.createSpan({ text: (this.plugin.settings.userName || "E").charAt(0).toUpperCase(), cls: "akos-avatar" });
    avatar.createSpan({ text: this.plugin.settings.userName || "Ethan" });
    createIcon(avatar, "chevron-down");
    avatar.addEventListener("click", () => this.plugin.openSettings());
  }

  renderKnowledgeHeader(parent, data) {
    const header = parent.createDiv({ cls: "akos-knowledge-header" });
    const copy = header.createDiv();
    copy.createEl("h1", { text: "Knowledge" });
    copy.createEl("p", { text: "你的结构化知识库，集中管理笔记、集合与关联知识。" });
    const settings = createButton(header, "知识库设置", "settings", "akos-knowledge-settings");
    settings.addEventListener("click", () => this.plugin.openSettings());
  }

  renderKnowledgeStats(parent, data) {
    const activeTags = data.tags.length;
    const featuredTags = data.tags.filter(([tag]) => !/(^|\/)(system|template|inbox|类型|状态)(\/|$)/i.test(tag));
    const cards = [
      ["总笔记数", formatNumber(data.notes.length), `较昨日 +${data.todayAdded}`, "notebook-text", "purple"],
      ["知识集合", formatNumber(data.collections.length), `覆盖 ${data.domainCounts.size} 个领域`, "layers-3", "blue"],
      ["活跃标签", formatNumber(activeTags), `${featuredTags.slice(0, 3).map(([tag]) => `#${tag}`).join(" · ") || "等待标注"}`, "tag", "cyan"],
      ["今日新增", formatNumber(data.todayAdded), "实时读取本地 Vault", "message-circle-plus", "orange"],
    ];
    const grid = parent.createDiv({ cls: "akos-stat-grid akos-knowledge-stat-grid" });
    cards.forEach(([label, value, trend, icon, color]) => {
      const card = grid.createDiv({ cls: "akos-stat-card" });
      createIcon(card, icon, `akos-stat-icon is-${color}`);
      const copy = card.createDiv({ cls: "akos-stat-copy" });
      copy.createDiv({ text: label, cls: "akos-stat-label" });
      copy.createEl("strong", { text: value });
      copy.createDiv({ text: trend, cls: "akos-stat-trend" });
    });
  }

  renderKnowledgeDomains(parent, data) {
    const section = parent.createDiv({ cls: "akos-panel akos-knowledge-domains" });
    const header = section.createDiv({ cls: "akos-panel-header" });
    header.createEl("h2", { text: "知识领域" });
    const all = createButton(header, "查看全部", "arrow-right", "akos-link-button");
    all.addEventListener("click", () => {
      this.knowledgeDomain = "all";
      void this.render();
    });
    const grid = section.createDiv({ cls: "akos-knowledge-domain-grid" });
    KNOWLEDGE_DOMAINS.forEach((domain) => {
      const count = data.domainCounts.get(domain.name) || 0;
      const card = grid.createEl("button", { cls: `akos-knowledge-domain${this.knowledgeDomain === domain.name ? " is-active" : ""}` });
      createIcon(card, domain.icon, `is-${domain.color}`);
      const copy = card.createDiv();
      copy.createEl("strong", { text: domain.name });
      copy.createSpan({ text: `${formatNumber(count)} 笔记` });
      copy.createEl("p", { text: domain.description });
      card.addEventListener("click", () => {
        this.knowledgeDomain = this.knowledgeDomain === domain.name ? "all" : domain.name;
        void this.render();
      });
    });
  }

  getVisibleKnowledgeNotes(data) {
    let notes = [...data.notes];
    if (this.knowledgeDomain !== "all") notes = notes.filter((note) => note.category === this.knowledgeDomain);
    if (this.knowledgeTab === "recent") notes = notes.filter((note) => Date.now() - note.file.stat.mtime < 14 * 86400000);
    if (this.knowledgeTab === "favorites") notes = notes.filter((note) => note.favorite);
    if (this.knowledgeTab === "collections" && this.selectedCollection) notes = notes.filter((note) => note.tags.includes(this.selectedCollection));
    if (this.knowledgeTab === "tags") notes = notes.filter((note) => note.tags.length);
    notes.sort(this.knowledgeSort === "title"
      ? (a, b) => a.file.basename.localeCompare(b.file.basename, "zh-CN")
      : (a, b) => b.file.stat.mtime - a.file.stat.mtime);
    return notes;
  }

  renderKnowledgeLibrary(parent, data) {
    const section = parent.createDiv({ cls: "akos-panel akos-knowledge-library" });
    const toolbar = section.createDiv({ cls: "akos-knowledge-toolbar" });
    const tabs = toolbar.createDiv({ cls: "akos-knowledge-tabs" });
    [["all", "全部"], ["recent", "最近编辑"], ["favorites", "收藏"], ["collections", "知识集合"], ["tags", "标签"]].forEach(([id, label]) => {
      const button = tabs.createEl("button", { text: label, cls: this.knowledgeTab === id ? "is-active" : "" });
      button.addEventListener("click", () => {
        this.knowledgeTab = id;
        if (id !== "collections") this.selectedCollection = null;
        void this.render();
      });
    });
    const filters = toolbar.createDiv({ cls: "akos-knowledge-filters" });
    const category = filters.createEl("select", { attr: { "aria-label": "知识领域" } });
    category.createEl("option", { text: "全部类型", value: "all" });
    KNOWLEDGE_DOMAINS.forEach((domain) => category.createEl("option", { text: domain.name, value: domain.name }));
    category.value = this.knowledgeDomain;
    category.addEventListener("change", () => {
      this.knowledgeDomain = category.value;
      void this.render();
    });
    const sort = filters.createEl("select", { attr: { "aria-label": "排序方式" } });
    sort.createEl("option", { text: "最近更新", value: "recent" });
    sort.createEl("option", { text: "标题排序", value: "title" });
    sort.value = this.knowledgeSort;
    sort.addEventListener("change", () => {
      this.knowledgeSort = sort.value;
      void this.render();
    });
    createIcon(filters, "list", "akos-knowledge-view-icon");
    const list = section.createDiv({ cls: "akos-knowledge-note-list" });
    const notes = this.getVisibleKnowledgeNotes(data).slice(0, 12);
    if (!notes.length) {
      const empty = list.createDiv({ cls: "akos-knowledge-empty" });
      createIcon(empty, "search-x");
      empty.createEl("p", { text: "当前筛选下没有知识笔记。" });
      return;
    }
    notes.forEach((note, index) => {
      const domain = KNOWLEDGE_DOMAINS.find((item) => item.name === note.category) || KNOWLEDGE_DOMAINS[0];
      const row = list.createDiv({ cls: "akos-knowledge-note-row" });
      row.dataset.search = `${note.file.basename} ${note.snippet} ${note.tags.join(" ")}`.toLowerCase();
      row.dataset.category = note.category;
      createIcon(row, index % 3 === 2 ? "file-chart-column" : "file-text", `akos-knowledge-note-icon is-${domain.color}`);
      const title = row.createEl("button", { text: note.file.basename, cls: "akos-knowledge-note-title" });
      title.addEventListener("click", () => this.openFile(note.file.path));
      const tagWrap = row.createDiv({ cls: "akos-knowledge-note-tags" });
      (note.tags.length ? note.tags : [note.category]).slice(0, 2).forEach((tag) => tagWrap.createSpan({ text: tag }));
      row.createEl("p", { text: note.snippet, cls: "akos-knowledge-note-snippet" });
      row.createSpan({ text: note.source, cls: "akos-knowledge-note-source" });
      row.createSpan({ text: formatRelativeTime(note.file.stat.mtime), cls: "akos-knowledge-note-time" });
      const favorite = createButton(row, "", "star", `akos-knowledge-favorite${note.favorite ? " is-active" : ""}`);
      favorite.setAttr("aria-label", note.favorite ? "取消收藏" : "收藏笔记");
      favorite.addEventListener("click", () => this.toggleKnowledgeFavorite(note));
      const more = createButton(row, "", "ellipsis", "akos-knowledge-more");
      more.setAttr("aria-label", "打开笔记");
      more.addEventListener("click", () => this.openFile(note.file.path));
    });
    this.applyKnowledgeFilter();
  }

  applyKnowledgeFilter() {
    const query = this.knowledgeQuery;
    this.contentEl.querySelectorAll(".akos-knowledge-note-row").forEach((row) => {
      row.toggleClass("is-filtered", Boolean(query && !row.dataset.search?.includes(query)));
    });
  }

  async toggleKnowledgeFavorite(note) {
    await this.app.fileManager.processFrontMatter(note.file, (frontmatter) => {
      frontmatter.favorite = !note.favorite;
    });
    new Notice(note.favorite ? "已取消收藏" : "已加入收藏");
    await this.render();
  }

  renderKnowledgeBottom(parent, data) {
    const grid = parent.createDiv({ cls: "akos-knowledge-bottom" });
    const shelf = grid.createDiv({ cls: "akos-panel akos-knowledge-shelf" });
    const shelfHeader = shelf.createDiv({ cls: "akos-panel-header" });
    shelfHeader.createEl("h2", { text: "知识集合（收藏架）" });
    const open = createButton(shelfHeader, "查看全部", "arrow-right", "akos-link-button");
    open.addEventListener("click", () => {
      this.knowledgeTab = "collections";
      this.selectedCollection = null;
      void this.render();
    });
    const cards = shelf.createDiv({ cls: "akos-knowledge-collection-grid" });
    data.collections.forEach((collection, index) => {
      const card = cards.createEl("button", { cls: "akos-knowledge-collection" });
      createIcon(card, ["folder-heart", "bot", "database-zap", "notebook-tabs"][index % 4], `is-${["purple", "blue", "cyan", "orange"][index % 4]}`);
      card.createEl("strong", { text: collection.name });
      card.createSpan({ text: `${collection.items.length} 笔记` });
      card.createEl("small", { text: `${collection.links} 链接 · ${formatRelativeTime(collection.updated)}` });
      card.addEventListener("click", () => {
        this.knowledgeTab = "collections";
        this.selectedCollection = collection.name;
        void this.render();
      });
    });
    const graph = grid.createDiv({ cls: "akos-panel akos-knowledge-graph akos-knowledge-native-graph" });
    const graphHeader = graph.createDiv({ cls: "akos-panel-header" });
    graphHeader.createEl("h2", { text: "Obsidian 关系图谱" });
    graphHeader.createSpan({ text: "原生 Graph · 可缩放与拖拽", cls: "akos-native-graph-caption" });
    const graphButton = createButton(graphHeader, "打开完整图谱", "maximize-2", "akos-link-button akos-native-graph-open");
    graphButton.addEventListener("click", () => this.openNativeGraph());
    const body = graph.createDiv({ cls: "akos-native-graph-body" });
    const host = body.createDiv({ cls: "akos-native-graph-host" });
    host.createDiv({ text: "正在载入 Obsidian 关系图谱…", cls: "akos-native-graph-loading" });
    void this.mountNativeGraph(host);
  }

  createKnowledgeNote() {
    new PromptModal(this.app, "新建知识笔记", "新笔记会直接进入 Knowledge，不再经过 Inbox。", async (title) => {
      const name = safeName(title);
      await ensureVaultFolder(this.app, `${ROOT}/Knowledge`);
      const path = await this.uniquePath(`${ROOT}/Knowledge/${name}.md`);
      const content = `---\ntitle: ${yamlQuote(name)}\ntype: concept\nstatus: seed\ndomain:\nfavorite: false\ncreated: ${new Date().toISOString()}\ntags:\n  - knowledge\n---\n\n# ${name}\n\n## 核心定义\n\n\n## 证据与边界\n\n\n## 关联知识\n\n`;
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf("tab").openFile(file);
      new Notice("知识笔记已创建");
    }).open();
  }

  showKnowledgeInsight(data) {
    const thinDomains = [...data.domainCounts.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2);
    const connected = data.notes.filter((note) => note.links > 0).length;
    this.aiTitle = "今日知识洞察";
    this.aiMessage = "基于当前领域覆盖、标签和 Wikilink 的本地分析。";
    this.searchResults = `当前 ${connected}/${data.notes.length} 篇笔记已进入关系网络。建议优先补充 ${thinDomains.map(([name, count]) => `${name}（${count} 篇）`).join("、")}，并为最近新增笔记建立至少一个双链。`;
    void this.render();
  }

  async mountNativeGraph(host) {
    this.nativeGraphHost = host;
    try {
      if (!this.nativeGraphLeaf) {
        const WorkspaceLeafClass = this.leaf.constructor;
        const leaf = new WorkspaceLeafClass(this.app);
        leaf.containerEl.addClass("akos-embedded-graph-leaf");
        this.nativeGraphLeaf = leaf;
        this.nativeGraphReady = leaf.setViewState({ type: "graph", active: false });
      }
      host.appendChild(this.nativeGraphLeaf.containerEl);
      await this.nativeGraphReady;
      if (this.nativeGraphHost !== host || !host.isConnected || !this.nativeGraphLeaf) return;
      host.appendChild(this.nativeGraphLeaf.containerEl);
      this.nativeGraphLeaf.view?.contentEl?.addClass("akos-embedded-native-graph");
      host.querySelector(".akos-native-graph-loading")?.remove();
      this.applyNativeGraphPalette();
      window.requestAnimationFrame(() => {
        this.nativeGraphLeaf?.view?.onResize?.();
        this.nativeGraphLeaf?.view?.renderer?.onResize?.();
        this.applyNativeGraphPalette();
      });
    } catch (error) {
      console.error("AI Knowledge OS: failed to mount native Obsidian graph", error);
      if (this.nativeGraphHost !== host) return;
      host.empty();
      const fallback = host.createDiv({ cls: "akos-native-graph-fallback" });
      fallback.createEl("strong", { text: "Obsidian Graph 暂时不可用" });
      const open = createButton(fallback, "打开完整图谱", "share-2", "akos-secondary-button");
      open.addEventListener("click", () => this.openNativeGraph());
    }
  }

  applyNativeGraphPalette() {
    const renderer = this.nativeGraphLeaf?.view?.renderer;
    const colors = renderer?.colors;
    if (!colors) return;
    const apply = (key, hex, alpha = 1) => {
      if (!colors[key]) return;
      colors[key].rgb = Number.parseInt(hex.slice(1), 16);
      colors[key].a = alpha;
    };
    // Static graph: every node type and every connection uses the purple system palette.
    apply("fill", "#a78bfa");
    apply("fillTag", "#a78bfa");
    apply("fillUnresolved", "#a78bfa");
    apply("fillAttachment", "#a78bfa");
    apply("circle", "#a78bfa");
    apply("line", "#7957e8", .82);
    apply("arrow", "#7957e8", .72);
    apply("text", "#b9addd");
    // Dynamic graph: hovered, selected and animated portions switch to neutral gray.
    apply("fillFocused", "#8c93a6");
    apply("fillHighlight", "#8c93a6");
    apply("lineHighlight", "#8c93a6", .88);
    renderer.changed?.();
    renderer.queueRender?.();
  }

  async openNativeGraph() {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: "graph", active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  renderKnowledgeAssistant(app, data) {
    const aside = app.createEl("aside", { cls: "akos-copilot akos-knowledge-assistant" });
    app.toggleClass("is-copilot-collapsed", this.copilotCollapsed);
    aside.toggleClass("is-collapsed", this.copilotCollapsed);
    const header = aside.createDiv({ cls: "akos-copilot-header" });
    const title = header.createDiv({ cls: "akos-copilot-title" });
    createIcon(title, "sparkles");
    title.createEl("strong", { text: "AI 助手" });
    const toggle = createButton(header, "", this.copilotCollapsed ? "panel-left-open" : "panel-right-close", "akos-icon-button akos-assistant-toggle");
    toggle.setAttr("aria-label", this.copilotCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.addEventListener("click", () => {
      this.copilotCollapsed = !this.copilotCollapsed;
      void this.render();
    });
    const scroll = aside.createDiv({ cls: "akos-copilot-scroll akos-knowledge-assistant-scroll" });
    const intro = scroll.createDiv({ cls: "akos-copilot-intro" });
    intro.createEl("h2", { text: `你好，${this.plugin.settings.userName} 👋` });
    intro.createEl("p", { text: this.aiMessage || "我是你的 AI 知识助手，有什么可以帮你？" });
    const suggestions = scroll.createDiv({ cls: "akos-suggestions" });
    [["总结当前知识库", "notebook-text", () => this.showTrends(data.base)], ["查找相关知识和关联", "blocks", () => this.findRelated()], ["生成文章或报告", "square-pen", () => this.createArticle()], ["为项目生成方案", "folder-kanban", () => this.createProject()], ["发现知识缺口", "scan-search", () => this.showKnowledgeGaps(data)]].forEach(([label, icon, action]) => {
      const button = createButton(suggestions, label, icon, "akos-suggestion");
      button.addEventListener("click", action);
    });
    if (this.searchResults) {
      const response = scroll.createDiv({ cls: "akos-ai-response is-visible" });
      response.createDiv({ text: this.aiTitle, cls: "akos-ai-response-title" });
      if (typeof this.searchResults === "string") response.createEl("p", { text: this.searchResults });
      else this.searchResults.forEach((result) => {
        const row = response.createEl("button", { cls: "akos-search-result" });
        const copy = row.createDiv();
        copy.createEl("strong", { text: result.file.basename });
        copy.createEl("p", { text: result.snippet });
        row.addEventListener("click", () => this.openFile(result.file.path));
      });
    }
    const recommendation = scroll.createDiv({ cls: "akos-knowledge-recommendation" });
    recommendation.createEl("h3", { text: "推荐阅读" });
    const recommended = [...data.notes].sort((a, b) => b.links - a.links || b.file.stat.mtime - a.file.stat.mtime)[0];
    if (recommended) {
      const card = recommendation.createEl("button", { cls: "akos-knowledge-recommendation-card" });
      createIcon(card, "book-open-check");
      const copy = card.createDiv();
      copy.createEl("strong", { text: recommended.file.basename });
      copy.createEl("p", { text: `${recommended.links} 个知识连接 · ${recommended.category}` });
      card.addEventListener("click", () => this.openFile(recommended.file.path));
    }
    recommendation.createEl("h3", { text: "你最近关注" });
    const assistantTags = data.tags.filter(([tag]) => !/(^|\/)(system|template|inbox|类型|状态)(\/|$)/i.test(tag));
    const focus = "AI Agent";
    recommendation.createDiv({ text: focus, cls: "akos-knowledge-focus" });
    recommendation.createEl("h3", { text: "相关知识" });
    const related = recommendation.createDiv({ cls: "akos-tags" });
    const relatedSuggestions = [...new Set(["FDE", "RAG", "企业自动化", ...assistantTags.map(([tag]) => tag)])]
      .slice(0, 7)
      .map((tag) => [tag, data.tags.find(([current]) => current === tag)?.[1] || 0]);
    relatedSuggestions.forEach(([tag, count]) => {
      const chip = related.createEl("button", { text: `+ ${tag}`, cls: "akos-tag" });
      chip.setAttr("title", `${count} 篇笔记`);
      chip.addEventListener("click", () => this.runKnowledgeSearch(String(tag)));
    });
    const context = scroll.createDiv({ cls: "akos-context" });
    context.createEl("h3", { text: "当前知识库概览" });
    const contextCard = context.createDiv({ cls: "akos-context-card" });
    const contextGrid = contextCard.createDiv({ cls: "akos-context-grid" });
    [[formatNumber(data.notes.length), "笔记数量", "notebook-text", "purple"], [formatNumber(data.base.links), "链接数量", "link-2", "cyan"], [formatNumber(data.collections.length), "知识集合", "layers-3", "orange"], [formatSize(data.base.bytes), "文本大小", "database", "blue"]].forEach(([value, label, icon, color]) => {
      const cell = contextGrid.createDiv({ cls: "akos-context-cell" });
      createIcon(cell, icon, `is-${color}`);
      const copy = cell.createDiv();
      copy.createEl("strong", { text: value });
      copy.createSpan({ text: label });
    });
    const composer = aside.createDiv({ cls: "akos-composer" });
    const input = composer.createEl("textarea", { attr: { rows: "2", placeholder: "Ask your knowledge…", "aria-label": "询问知识库" }, cls: "akos-prompt" });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (input.value.trim()) this.runKnowledgeSearch(input.value.trim());
      }
    });
    const actions = composer.createDiv({ cls: "akos-composer-actions" });
    createButton(actions, "", "paperclip", "akos-icon-button").addEventListener("click", () => this.summarizeCurrent());
    const send = createButton(actions, "", "send-horizontal", "akos-send");
    send.addEventListener("click", () => {
      if (input.value.trim()) this.runKnowledgeSearch(input.value.trim());
    });
    composer.createDiv({ text: "基于你的本地知识库生成，内容仅供参考", cls: "akos-composer-note" });
  }

  showKnowledgeGaps(data) {
    const gaps = KNOWLEDGE_DOMAINS
      .map((domain) => [domain.name, data.domainCounts.get(domain.name) || 0])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3);
    this.aiTitle = "知识缺口";
    this.aiMessage = "根据领域分布与连接密度生成的本地诊断。";
    this.searchResults = `当前最需要补充的领域：${gaps.map(([name, count]) => `${name}（${count} 篇）`).join("、")}。建议优先为孤立笔记建立双链。`;
    void this.render();
  }
}

const GRAPH_TOPICS = [
  { id: "fde", label: "FDE", category: "business", color: "purple", x: 380, y: 235, r: 48, pattern: /(fde|forward deployed|前线部署|驻场工程)/i, satellites: ["企业落地", "需求桥接", "现场交付", "技术方案"] },
  { id: "agent", label: "AI Agent", category: "tech", color: "violet", x: 245, y: 115, r: 34, pattern: /(ai\s*agent|agent|智能体|工具调用)/i, satellites: ["智能体设计", "工具调用", "记忆管理", "提示工程"] },
  { id: "rag", label: "RAG", category: "tech", color: "purple", x: 205, y: 250, r: 30, pattern: /(rag|检索增强|向量数据库|embedding)/i, satellites: ["检索增强", "向量数据库", "Embedding", "语义匹配"] },
  { id: "knowledge", label: "知识库", category: "tech", color: "cyan", x: 520, y: 120, r: 34, pattern: /(知识库|knowledge base|知识图谱|知识工程)/i, satellites: ["知识建模", "本体设计", "知识图谱", "数据治理"] },
  { id: "automation", label: "自动化工作流", category: "business", color: "blue", x: 570, y: 250, r: 35, pattern: /(自动化|工作流|workflow|流程编排|任务调度)/i, satellites: ["流程编排", "任务调度", "集成连接", "监控告警"] },
  { id: "product", label: "产品案例", category: "project", color: "teal", x: 285, y: 375, r: 35, pattern: /(产品|方案|解决方案|产品设计|实施方法)/i, satellites: ["产品设计", "解决方案", "实施方法", "价值验证"] },
  { id: "client", label: "客户案例", category: "people", color: "blue", x: 500, y: 380, r: 33, pattern: /(客户|案例|行业实践|成功案例|roi)/i, satellites: ["客户需求", "成功案例", "行业实践", "ROI 分析"] },
];

class KnowledgeGraphView extends KnowledgeDashboardView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.selectedNodeId = "fde";
    this.graphFilter = "all";
    this.graphDepth = Number(plugin.settings.graphDefaultDepth || 2);
    this.renderVersion = 0;
    this.refresh = debounce(() => this.render(), 350);
  }

  getViewType() {
    return GRAPH_VIEW_TYPE;
  }

  getDisplayText() {
    return "Knowledge Map · AI Knowledge OS";
  }

  getIcon() {
    return "share-2";
  }

  async onOpen() {
    this.contentEl.addClass("akos-view-content", "akos-graph-view-content");
    await this.render();
  }

  async onClose() {
    this.contentEl.removeClass("akos-view-content", "akos-graph-view-content");
  }

  async getGraphData() {
    const base = this.getStats();
    const resolved = this.app.metadataCache.resolvedLinks || {};
    const notes = await Promise.all(base.files.map(async (file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter || {};
      const content = await this.app.vault.cachedRead(file);
      const tags = [];
      (cache?.tags || []).forEach((tag) => tags.push(tag.tag.replace(/^#/, "")));
      const fmTags = frontmatter.tags;
      if (Array.isArray(fmTags)) tags.push(...fmTags.map(String));
      else if (typeof fmTags === "string") tags.push(fmTags);
      return {
        file,
        cache,
        frontmatter,
        content,
        tags: [...new Set(tags)],
        signature: `${file.path.replace(new RegExp(`^${ROOT}/?`, "i"), "")} ${tags.join(" ")} ${content}`,
        outgoing: Object.keys(resolved[file.path] || {}).length,
      };
    }));
    const nodes = GRAPH_TOPICS.map((topic) => {
      const matches = notes.filter((note) => topic.pattern.test(note.signature));
      const projects = matches.filter((note) => note.frontmatter.type === "project" || /\/Projects\//i.test(note.file.path));
      const clients = matches.filter((note) => /(客户|customer|client|企业案例)/i.test(note.signature));
      const tagCounts = new Map();
      matches.forEach((note) => note.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
      const tags = [...tagCounts.entries()]
        .filter(([tag]) => !/(^|\/)(system|template|inbox|类型|状态)(\/|$)/i.test(tag))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const links = matches.reduce((sum, note) => sum + note.outgoing, 0);
      return {
        ...topic,
        notes: matches,
        projects,
        clients,
        tags,
        links,
        strength: Math.min(.98, .55 + Math.log2(links + matches.length + 1) / 12),
      };
    });
    const graphIndex = this.buildGraphIndex(notes, resolved);
    const topicIdsByPath = new Map();
    notes.forEach((note) => {
      const ids = nodes.filter((node) => node.notes.some((match) => match.file.path === note.file.path)).map((node) => node.id);
      topicIdsByPath.set(note.file.path, ids);
    });
    const edgeWeights = new Map();
    const addTopicEdge = (left, right, amount = 1) => {
      if (!left || !right || left === right) return;
      const key = [left, right].sort().join("::");
      edgeWeights.set(key, (edgeWeights.get(key) || 0) + amount);
    };
    topicIdsByPath.forEach((ids) => {
      for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) addTopicEdge(ids[left], ids[right], 1);
      }
    });
    Object.entries(resolved).forEach(([sourcePath, targets]) => {
      const sourceTopics = topicIdsByPath.get(sourcePath) || [];
      Object.keys(targets || {}).forEach((targetPath) => {
        const targetTopics = topicIdsByPath.get(targetPath) || [];
        sourceTopics.forEach((sourceTopic) => targetTopics.forEach((targetTopic) => addTopicEdge(sourceTopic, targetTopic, 2)));
      });
    });
    const edges = [...edgeWeights.entries()].map(([key, weight]) => {
      const [from, to] = key.split("::");
      const fromNode = nodes.find((node) => node.id === from);
      const toNode = nodes.find((node) => node.id === to);
      const fromPaths = new Set(fromNode?.notes.map((note) => note.file.path) || []);
      const toPaths = new Set(toNode?.notes.map((note) => note.file.path) || []);
      const intersection = [...fromPaths].filter((path) => toPaths.has(path)).length;
      const union = new Set([...fromPaths, ...toPaths]).size;
      return { from, to, weight, strength: union ? intersection / union : 0 };
    }).sort((a, b) => b.weight - a.weight);
    nodes.forEach((node) => {
      const incident = edges.filter((edge) => edge.from === node.id || edge.to === node.id);
      const totalWeight = incident.reduce((sum, edge) => sum + edge.weight, 0);
      node.strength = Math.min(.98, totalWeight ? .45 + Math.log2(totalWeight + 1) / 10 : .15);
    });
    const linkEdges = [];
    Object.entries(resolved).forEach(([source, targets]) => Object.keys(targets || {}).forEach((target) => linkEdges.push(`${source}->${target}`)));
    const todayLinks = await this.plugin.updateGraphSnapshot(linkEdges);
    const clusters = [
      { id: "tech", label: "AI技术", icon: "zap", color: "purple", count: nodes.filter((node) => node.category === "tech").reduce((sum, node) => sum + node.notes.length, 0) },
      { id: "business", label: "企业案例", icon: "briefcase-business", color: "blue", count: nodes.filter((node) => node.category === "business").reduce((sum, node) => sum + node.notes.length, 0) },
      { id: "project", label: "产品方案", icon: "box", color: "cyan", count: nodes.filter((node) => node.category === "project").reduce((sum, node) => sum + node.notes.length, 0) },
      { id: "business", label: "商业模式", icon: "chart-no-axes-column-increasing", color: "orange", count: nodes.find((node) => node.id === "fde")?.notes.length || 0 },
      { id: "project", label: "内容素材", icon: "file-text", color: "pink", count: notes.filter((note) => /(内容|文章|素材|content)/i.test(note.signature)).length },
      { id: "tech", label: "学习资料", icon: "graduation-cap", color: "green", count: notes.filter((note) => /(学习|论文|课程|研究)/i.test(note.signature)).length },
    ];
    const hiddenAssociations = this.findHiddenAssociations(graphIndex, notes);
    return { base, notes, nodes, edges, clusters, todayLinks, graphIndex, hiddenAssociations };
  }

  buildGraphIndex(notes, resolved) {
    const nodeMap = new Map(notes.map((note) => [note.file.path, note]));
    const outgoing = new Map(notes.map((note) => [note.file.path, new Set()]));
    const incoming = new Map(notes.map((note) => [note.file.path, new Set()]));
    const undirected = new Map(notes.map((note) => [note.file.path, new Set()]));
    Object.entries(resolved).forEach(([source, targets]) => {
      if (!nodeMap.has(source)) return;
      Object.keys(targets || {}).forEach((target) => {
        if (!nodeMap.has(target)) return;
        outgoing.get(source).add(target);
        incoming.get(target).add(source);
        undirected.get(source).add(target);
        undirected.get(target).add(source);
      });
    });
    return { nodes: nodeMap, outgoing, incoming, undirected };
  }

  findShortestPath(index, sourcePath, targetPath, maxDepth = 4) {
    if (!sourcePath || !targetPath) return [];
    if (sourcePath === targetPath) return [sourcePath];
    const queue = [[sourcePath]];
    const visited = new Set([sourcePath]);
    while (queue.length) {
      const path = queue.shift();
      if (path.length - 1 >= maxDepth) continue;
      const neighbors = index.undirected.get(path[path.length - 1]) || new Set();
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        const next = [...path, neighbor];
        if (neighbor === targetPath) return next;
        visited.add(neighbor);
        queue.push(next);
      }
    }
    return [];
  }

  getTopicPaths(data, node, limit = 4) {
    const results = [];
    const targets = data.nodes.filter((item) => item.id !== node.id && item.notes.length).sort((a, b) => b.strength - a.strength);
    for (const target of targets) {
      let best = [];
      for (const sourceNote of node.notes.slice(0, 8)) {
        for (const targetNote of target.notes.slice(0, 8)) {
          const path = this.findShortestPath(data.graphIndex, sourceNote.file.path, targetNote.file.path, Math.max(2, this.graphDepth + 1));
          if (path.length && (!best.length || path.length < best.length)) best = path;
        }
      }
      if (best.length) results.push({ target, path: best, score: 1 / Math.max(1, best.length - 1) });
      if (results.length >= limit) break;
    }
    return results;
  }

  findHiddenAssociations(index, notes) {
    const candidates = [];
    const limited = notes.slice().sort((a, b) => b.file.stat.mtime - a.file.stat.mtime).slice(0, 160);
    for (let leftIndex = 0; leftIndex < limited.length; leftIndex += 1) {
      const left = limited[leftIndex];
      const leftNeighbors = index.undirected.get(left.file.path) || new Set();
      for (let rightIndex = leftIndex + 1; rightIndex < limited.length; rightIndex += 1) {
        const right = limited[rightIndex];
        if (leftNeighbors.has(right.file.path)) continue;
        const rightNeighbors = index.undirected.get(right.file.path) || new Set();
        const common = [...leftNeighbors].filter((path) => rightNeighbors.has(path));
        if (common.length < 2) continue;
        const leftTags = new Set(left.tags);
        const sharedTags = right.tags.filter((tag) => leftTags.has(tag));
        const score = common.length * .6 + sharedTags.length * .4;
        candidates.push({ left, right, common, sharedTags, score });
      }
    }
    return candidates.sort((a, b) => b.score - a.score).slice(0, 12);
  }

  getSelectedNode(data) {
    return data.nodes.find((node) => node.id === this.selectedNodeId) || data.nodes[0];
  }

  async render() {
    const version = ++this.renderVersion;
    const data = await this.getGraphData();
    if (version !== this.renderVersion) return;
    if (this.graphFilter !== "all") {
      const visibleNodes = data.nodes.filter((node) => node.category === this.graphFilter);
      if (visibleNodes.length && !visibleNodes.some((node) => node.id === this.selectedNodeId)) {
        this.selectedNodeId = visibleNodes[0].id;
      }
    }
    const root = this.contentEl;
    root.empty();
    const app = root.createDiv({ cls: "akos-app akos-graph-app" });
    this.renderGraphSidebar(app, data);
    const center = app.createDiv({ cls: "akos-center akos-graph-center" });
    this.renderGraphTopbar(center, data);
    const scroll = center.createDiv({ cls: "akos-scroll akos-graph-scroll" });
    this.renderGraphHeader(scroll);
    this.renderGraphStats(scroll, data);
    this.renderGraphToolbar(scroll);
    this.renderGraphWorkspace(scroll, data);
    this.renderGraphInsights(scroll, data);
    this.renderStatus(center, data.base);
    this.renderGraphAssistant(app, data);
  }

  renderGraphSidebar(app, data) {
    super.renderSidebar(app, data.base);
    app.querySelectorAll(".akos-nav-item").forEach((button) => {
      const title = button.querySelector(".akos-nav-title")?.textContent;
      button.classList.toggle("is-active", title === "Graph");
    });
  }

  renderGraphTopbar(center, data) {
    const topbar = center.createDiv({ cls: "akos-topbar" });
    const searchWrap = topbar.createDiv({ cls: "akos-search akos-graph-search" });
    createIcon(searchWrap, "search");
    const input = searchWrap.createEl("input", { attr: { type: "search", placeholder: "搜索知识节点、笔记、标签…", "aria-label": "搜索知识图谱" } });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const query = input.value.trim();
      const match = data.nodes.find((node) => node.label.toLowerCase().includes(query.toLowerCase()) || node.tags.some(([tag]) => tag.toLowerCase().includes(query.toLowerCase())));
      if (match) {
        this.selectedNodeId = match.id;
        void this.render();
      } else if (query) this.runKnowledgeSearch(query);
    });
    searchWrap.createSpan({ text: "⌘ K", cls: "akos-shortcut" });
    const actions = topbar.createDiv({ cls: "akos-top-actions" });
    const ai = createButton(actions, "AI 助手", "sparkles", "akos-top-action");
    ai.addEventListener("click", () => this.focusPrompt());
    const insight = createButton(actions, "今日洞察", "lightbulb", "akos-top-action");
    insight.addEventListener("click", () => this.showNodeSummary(data));
    const add = createButton(actions, "", "bell", "akos-icon-button");
    bindPlannedFeature(add, FEATURES.notificationCenter.label);
    const avatar = actions.createEl("button", { cls: "akos-avatar-button" });
    avatar.createSpan({ text: (this.plugin.settings.userName || "E").charAt(0).toUpperCase(), cls: "akos-avatar" });
    avatar.createSpan({ text: this.plugin.settings.userName || "Ethan" });
    createIcon(avatar, "chevron-down");
    avatar.addEventListener("click", () => this.plugin.openSettings());
  }

  renderGraphHeader(parent) {
    const header = parent.createDiv({ cls: "akos-graph-header" });
    const copy = header.createDiv();
    copy.createEl("h1", { text: "Graph" });
    copy.createEl("p", { text: "可视化查看知识节点、连接关系与主题聚类。" });
    const settings = createButton(header, "图谱设置", "settings", "akos-knowledge-settings");
    settings.addEventListener("click", () => this.plugin.openSettings("graph"));
  }

  renderGraphStats(parent, data) {
    const cards = [
      ["总节点数", formatNumber(data.notes.length), "本地知识笔记", "notebook-text", "purple"],
      ["总连接数", formatNumber(data.base.links), "Wikilink 真实连接", "layers-3", "blue"],
      ["聚类簇数", formatNumber(data.nodes.filter((node) => node.notes.length).length), "语义主题聚类", "tag", "cyan"],
      ["今日新增连接", formatNumber(data.todayLinks), "相对当日链接基线", "message-circle-plus", "orange"],
    ];
    const grid = parent.createDiv({ cls: "akos-stat-grid akos-knowledge-stat-grid akos-graph-stat-grid" });
    cards.forEach(([label, value, trend, icon, color]) => {
      const card = grid.createDiv({ cls: "akos-stat-card" });
      createIcon(card, icon, `akos-stat-icon is-${color}`);
      const copy = card.createDiv({ cls: "akos-stat-copy" });
      copy.createDiv({ text: label, cls: "akos-stat-label" });
      copy.createEl("strong", { text: value });
      copy.createDiv({ text: trend, cls: "akos-stat-trend" });
    });
  }

  renderGraphToolbar(parent) {
    const toolbar = parent.createDiv({ cls: "akos-panel akos-graph-toolbar" });
    const tabs = toolbar.createDiv({ cls: "akos-graph-tabs" });
    [["all", "全部"], ["tech", "技术"], ["business", "商业"], ["project", "项目"], ["people", "人物"]].forEach(([id, label]) => {
      const button = tabs.createEl("button", { text: label, cls: this.graphFilter === id ? "is-active" : "" });
      button.addEventListener("click", () => {
        this.graphFilter = id;
        void this.render();
      });
    });
    const controls = toolbar.createDiv({ cls: "akos-graph-controls" });
    const view = createButton(controls, "视图模式", "network", "akos-graph-control");
    bindPlannedFeature(view, "图谱视图切换");
    const depth = controls.createEl("select", { attr: { "aria-label": "连接深度" } });
    [1, 2, 3].forEach((value) => depth.createEl("option", { text: `连接深度 ${value}`, value: String(value) }));
    depth.value = String(this.graphDepth);
    depth.addEventListener("change", () => {
      this.graphDepth = Number(depth.value);
      void this.render();
    });
    const layout = createButton(controls, "布局：语义", "git-fork", "akos-graph-control");
    bindPlannedFeature(layout, "图谱布局切换");
    const filter = createButton(controls, "筛选标签", "list-filter", "akos-graph-control");
    bindPlannedFeature(filter, "图谱标签筛选");
  }

  renderGraphWorkspace(parent, data) {
    const workspace = parent.createDiv({ cls: "akos-graph-workspace" });
    this.renderGraphClusters(workspace, data);
    this.renderSemanticMap(workspace, data);
    this.renderNodeDetails(workspace, data);
  }

  renderGraphClusters(parent, data) {
    const panel = parent.createDiv({ cls: "akos-panel akos-graph-clusters" });
    const header = panel.createDiv({ cls: "akos-graph-side-title" });
    header.createEl("h2", { text: "知识聚类" });
    createIcon(header, "info");
    data.clusters.forEach((cluster) => {
      const row = panel.createEl("button", { cls: `akos-graph-cluster${this.graphFilter === cluster.id ? " is-active" : ""}` });
      createIcon(row, cluster.icon, `is-${cluster.color}`);
      const copy = row.createDiv();
      copy.createEl("strong", { text: cluster.label });
      copy.createSpan({ text: formatNumber(cluster.count) });
      row.createEl("i", { cls: `is-${cluster.color}` });
      row.addEventListener("click", () => {
        this.graphFilter = this.graphFilter === cluster.id ? "all" : cluster.id;
        void this.render();
      });
    });
    const all = createButton(panel, "查看全部聚类", "arrow-right", "akos-graph-all-clusters");
    all.addEventListener("click", () => {
      this.graphFilter = "all";
      void this.render();
    });
  }

  renderSemanticMap(parent, data) {
    const map = parent.createDiv({ cls: "akos-graph-map" });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 760 470");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "akos-semantic-svg");
    map.appendChild(svg);
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <radialGradient id="akos-node-purple"><stop offset="0" stop-color="#8a5cff" stop-opacity=".72"/><stop offset="1" stop-color="#311b75" stop-opacity=".95"/></radialGradient>
      <radialGradient id="akos-node-blue"><stop offset="0" stop-color="#397dff" stop-opacity=".68"/><stop offset="1" stop-color="#102c67" stop-opacity=".95"/></radialGradient>
      <radialGradient id="akos-node-cyan"><stop offset="0" stop-color="#25bcea" stop-opacity=".68"/><stop offset="1" stop-color="#0b425c" stop-opacity=".95"/></radialGradient>
      <radialGradient id="akos-node-teal"><stop offset="0" stop-color="#20c1bd" stop-opacity=".62"/><stop offset="1" stop-color="#0b4b50" stop-opacity=".95"/></radialGradient>
      <filter id="akos-glow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    svg.appendChild(defs);
    const visible = data.nodes.filter((node) => this.graphFilter === "all" || node.category === this.graphFilter);
    const visibleIds = new Set(visible.map((node) => node.id));
    data.edges.forEach((edge, index) => {
      if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return;
      const from = data.nodes.find((node) => node.id === edge.from);
      const to = data.nodes.find((node) => node.id === edge.to);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const cx = (from.x + to.x) / 2 + (index % 2 ? 18 : -18);
      const cy = (from.y + to.y) / 2 + (index % 3 - 1) * 12;
      path.setAttribute("d", `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`);
      path.setAttribute("class", `akos-semantic-edge is-${from.color}`);
      path.setAttribute("stroke-width", String(Math.min(5, 1.1 + Math.log2(edge.weight + 1))));
      path.setAttribute("data-strength", edge.strength.toFixed(3));
      svg.appendChild(path);
    });
    visible.forEach((node, nodeIndex) => {
      node.satellites.slice(0, this.graphDepth + 1).forEach((label, satelliteIndex, list) => {
        const start = -Math.PI * .82;
        const end = Math.PI * .82;
        const angle = list.length === 1 ? 0 : start + (end - start) * satelliteIndex / (list.length - 1) + (nodeIndex % 2 ? Math.PI : 0);
        const distance = node.r + 43;
        const x = Math.max(18, Math.min(742, node.x + Math.cos(angle) * distance));
        const y = Math.max(18, Math.min(452, node.y + Math.sin(angle) * distance));
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", node.x); line.setAttribute("y1", node.y); line.setAttribute("x2", x); line.setAttribute("y2", y);
        line.setAttribute("class", `akos-satellite-edge is-${node.color}`);
        svg.appendChild(line);
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("r", "4");
        dot.setAttribute("class", `akos-satellite-dot is-${node.color}`);
        svg.appendChild(dot);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x + (x < node.x ? -8 : 8));
        text.setAttribute("y", y + 3);
        text.setAttribute("text-anchor", x < node.x ? "end" : "start");
        text.setAttribute("class", "akos-satellite-label");
        text.textContent = label;
        svg.appendChild(text);
      });
    });
    visible.forEach((node) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", `akos-semantic-node is-${node.color}${this.selectedNodeId === node.id ? " is-selected" : ""}`);
      group.dataset.nodeId = node.id;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", node.x); circle.setAttribute("cy", node.y); circle.setAttribute("r", node.r);
      const gradient = node.color === "cyan" ? "cyan" : node.color === "teal" ? "teal" : node.color === "blue" ? "blue" : "purple";
      circle.setAttribute("fill", `url(#akos-node-${gradient})`);
      circle.setAttribute("class", "akos-semantic-node-circle");
      group.appendChild(circle);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", node.x); text.setAttribute("y", node.y + 5); text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "akos-semantic-node-label"); text.textContent = node.label;
      group.appendChild(text);
      const count = document.createElementNS("http://www.w3.org/2000/svg", "text");
      count.setAttribute("x", node.x); count.setAttribute("y", node.y + node.r + 15); count.setAttribute("text-anchor", "middle");
      count.setAttribute("class", "akos-semantic-node-count"); count.textContent = `${node.notes.length} notes`;
      group.appendChild(count);
      const select = () => {
        this.selectedNodeId = node.id;
        void this.render();
      };
      group.addEventListener("click", select);
      svg.appendChild(group);
    });
  }

  renderNodeDetails(parent, data) {
    const node = this.getSelectedNode(data);
    const panel = parent.createDiv({ cls: "akos-panel akos-node-details" });
    const header = panel.createDiv({ cls: "akos-graph-side-title" });
    header.createEl("h2", { text: "节点详情" });
    createIcon(header, "pin");
    panel.createDiv({ text: "节点名称", cls: "akos-node-label" });
    const name = panel.createDiv({ cls: "akos-node-name" });
    createIcon(name, node.id === "fde" ? "sparkles" : "circle-dot", `is-${node.color}`);
    name.createEl("strong", { text: node.label });
    panel.createDiv({ text: "类型", cls: "akos-node-label" });
    panel.createDiv({ text: node.category === "tech" ? "AI技术 / 方法论" : node.category === "business" ? "企业AI / 业务模式" : "项目 / 案例", cls: "akos-node-type" });
    const metrics = panel.createDiv({ cls: "akos-node-metrics" });
    [["笔记", node.notes.length], ["项目", node.projects.length], ["客户", node.clients.length]].forEach(([label, value]) => {
      const item = metrics.createDiv();
      item.createSpan({ text: label });
      item.createEl("strong", { text: formatNumber(value) });
    });
    const strengthLabel = panel.createDiv({ cls: "akos-node-strength-label" });
    strengthLabel.createSpan({ text: "连接强度" });
    strengthLabel.createEl("strong", { text: node.strength.toFixed(2) });
    const strength = panel.createDiv({ cls: "akos-node-strength" });
    strength.createSpan({ attr: { style: `width:${Math.round(node.strength * 100)}%` } });
    panel.createDiv({ text: "AI 摘要", cls: "akos-node-label" });
    panel.createEl("p", { text: this.nodeSummary(node), cls: "akos-node-summary" });
    panel.createDiv({ text: "相关标签", cls: "akos-node-label" });
    const tags = panel.createDiv({ cls: "akos-tags akos-node-tags" });
    const nodeTags = node.tags.length ? node.tags : [["企业AI", 1], ["AI Agent", 1], ["知识库", 1]];
    nodeTags.slice(0, 3).forEach(([tag]) => tags.createSpan({ text: `#${tag}`, cls: "akos-tag" }));
    if (nodeTags.length > 3) tags.createSpan({ text: `+${nodeTags.length - 3}`, cls: "akos-tag akos-node-tag-more" });
    const open = createButton(panel, "打开笔记", "file-text", "akos-node-primary");
    open.disabled = !node.notes.length;
    open.addEventListener("click", () => node.notes[0] && this.openFile(node.notes[0].file.path));
    const path = createButton(panel, "查看路径", "route", "akos-node-secondary");
    path.addEventListener("click", () => this.showNodePaths(data));
  }

  nodeSummary(node) {
    const summaries = {
      fde: "FDE 是企业 AI 落地的重要桥梁，连接业务需求、技术实现与部署执行。",
      agent: "AI Agent 将模型能力、工具调用与业务流程组织成可持续运行的智能体。",
      rag: "RAG 通过检索外部知识增强模型回答，是企业知识库可信生成的核心路径。",
      knowledge: "知识库负责沉淀组织事实、方法和关系，为 AI 提供稳定上下文。",
      automation: "自动化工作流把触发条件、任务执行与反馈闭环连接为可复用流程。",
      product: "产品案例将技术能力转换为明确场景、解决方案与可验证价值。",
      client: "客户案例记录真实需求、实施过程和结果，是方案复用的重要证据。",
    };
    return summaries[node.id] || `${node.label} 是当前知识网络中的重要主题节点。`;
  }

  renderGraphInsights(parent, data) {
    const node = this.getSelectedNode(data);
    const grid = parent.createDiv({ cls: "akos-graph-insights" });
    const paths = grid.createDiv({ cls: "akos-panel akos-path-panel" });
    const pathHeader = paths.createDiv({ cls: "akos-panel-header" });
    pathHeader.createEl("h2", { text: "关系路径推荐" });
    const all = createButton(pathHeader, "查看全部路径", "arrow-right", "akos-link-button");
    all.addEventListener("click", () => this.showNodePaths(data));
    const topicPaths = this.getTopicPaths(data, node, 3);
    topicPaths.forEach((entry, index) => {
      const row = paths.createDiv({ cls: "akos-path-row" });
      row.createSpan({ text: String(index + 1), cls: "akos-path-index" });
      row.createSpan({ text: entry.path.map((path) => data.graphIndex.nodes.get(path)?.file.basename || path).join(" → ") });
      row.createEl("strong", { text: entry.score.toFixed(2) });
    });
    if (!topicPaths.length) paths.createDiv({ text: "当前节点暂无可追溯的真实 Wikilink 路径。", cls: "akos-project-muted" });
    const discoveries = grid.createDiv({ cls: "akos-panel akos-discovery-panel" });
    const discoveryHeader = discoveries.createDiv({ cls: "akos-panel-header" });
    discoveryHeader.createEl("h2", { text: "隐藏关联发现" });
    const see = createButton(discoveryHeader, "查看全部发现", "arrow-right", "akos-link-button");
    see.addEventListener("click", () => this.showNodeGaps(data));
    const hidden = data.hiddenAssociations[0];
    [["高潜在关联", hidden ? `建议关联「${hidden.left.file.basename}」与「${hidden.right.file.basename}」，共有 ${hidden.common.length} 个共同邻居` : "当前没有达到阈值的建议关联", "flame", "pink"], ["跨域连接", `「${node.label}」当前有 ${topicPaths.length} 条可追溯跨主题路径`, "asterisk", "orange"], ["孤岛节点", `${data.base.orphans} 篇笔记尚未进入稳定关系网络`, "circle-alert", "green"]].forEach(([label, copy, icon, color]) => {
      const row = discoveries.createDiv({ cls: "akos-discovery-row" });
      createIcon(row, icon, `is-${color}`);
      const text = row.createDiv();
      text.createEl("strong", { text: label });
      text.createEl("p", { text: copy });
    });
  }

  renderGraphAssistant(app, data) {
    const node = this.getSelectedNode(data);
    const aside = app.createEl("aside", { cls: "akos-copilot akos-graph-assistant" });
    app.toggleClass("is-copilot-collapsed", this.copilotCollapsed);
    aside.toggleClass("is-collapsed", this.copilotCollapsed);
    const header = aside.createDiv({ cls: "akos-copilot-header" });
    const title = header.createDiv({ cls: "akos-copilot-title" });
    createIcon(title, "sparkles");
    title.createEl("strong", { text: "AI 助手" });
    const toggle = createButton(header, "", this.copilotCollapsed ? "panel-left-open" : "panel-right-close", "akos-icon-button akos-assistant-toggle");
    toggle.setAttr("aria-label", this.copilotCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.addEventListener("click", () => {
      this.copilotCollapsed = !this.copilotCollapsed;
      void this.render();
    });
    const scroll = aside.createDiv({ cls: "akos-copilot-scroll akos-graph-assistant-scroll" });
    const intro = scroll.createDiv({ cls: "akos-copilot-intro" });
    intro.createEl("h2", { text: `你好，${this.plugin.settings.userName} 👋` });
    intro.createEl("p", { text: this.aiMessage || "我能帮你分析知识节点、关系路径与知识缺口。" });
    const suggestions = scroll.createDiv({ cls: "akos-suggestions" });
    [["总结当前节点", "chart-pie", () => this.showNodeSummary(data)], ["查找相关知识和关联", "blocks", () => this.runKnowledgeSearch(node.label)], ["生成知识路径报告", "square-pen", () => this.createGraphReport(data)], ["发现知识缺口", "scan-search", () => this.showNodeGaps(data)], ["发现隐藏关联", "scan-line", () => this.showNodePaths(data)]].forEach(([label, icon, action]) => {
      const button = createButton(suggestions, label, icon, "akos-suggestion");
      button.addEventListener("click", action);
    });
    if (this.searchResults) {
      const response = scroll.createDiv({ cls: "akos-ai-response is-visible" });
      response.createDiv({ text: this.aiTitle, cls: "akos-ai-response-title" });
      if (typeof this.searchResults === "string") response.createEl("p", { text: this.searchResults });
      else this.searchResults.forEach((result) => {
        const row = response.createEl("button", { cls: "akos-search-result" });
        const copy = row.createDiv();
        copy.createEl("strong", { text: result.file.basename });
        copy.createEl("p", { text: result.snippet });
        row.addEventListener("click", () => this.openFile(result.file.path));
      });
    }
    const context = scroll.createDiv({ cls: "akos-context akos-graph-context" });
    context.createEl("h3", { text: "当前知识库概览" });
    const contextCard = context.createDiv({ cls: "akos-context-card" });
    const contextGrid = contextCard.createDiv({ cls: "akos-context-grid" });
    [[formatNumber(data.notes.length), "总节点数", "network", "cyan"], [formatNumber(data.base.links), "总连接数", "route", "green"], [formatNumber(data.nodes.filter((item) => item.notes.length).length), "聚类簇数", "shield", "orange"], [formatSize(data.base.bytes), "文本大小", "database", "blue"]].forEach(([value, label, icon, color]) => {
      const cell = contextGrid.createDiv({ cls: "akos-context-cell" });
      createIcon(cell, icon, `is-${color}`);
      const copy = cell.createDiv();
      copy.createEl("strong", { text: value });
      copy.createSpan({ text: label });
    });
    contextCard.createDiv({ text: "活跃标签", cls: "akos-context-label akos-context-label-tags" });
    const tags = contextCard.createDiv({ cls: "akos-tags" });
    const graphTags = [...new Set(["FDE", "AI Agent", "知识库", "自动化", "企业AI", ...node.tags.map(([tag]) => tag)])].slice(0, 7);
    graphTags.forEach((tag) => {
      const chip = tags.createEl("button", { text: `#${tag}`, cls: "akos-tag" });
      chip.addEventListener("click", () => this.runKnowledgeSearch(tag));
    });
    const composer = aside.createDiv({ cls: "akos-composer" });
    const input = composer.createEl("textarea", { attr: { rows: "2", placeholder: "Ask your knowledge…", "aria-label": "询问知识图谱" }, cls: "akos-prompt" });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (input.value.trim()) this.runKnowledgeSearch(input.value.trim());
      }
    });
    const actions = composer.createDiv({ cls: "akos-composer-actions" });
    const attach = createButton(actions, "", "paperclip", "akos-icon-button");
    attach.setAttr("aria-label", "附加当前节点");
    attach.addEventListener("click", () => this.showNodeSummary(data));
    const send = createButton(actions, "", "send-horizontal", "akos-send");
    send.addEventListener("click", () => {
      if (input.value.trim()) this.runKnowledgeSearch(input.value.trim());
    });
    composer.createDiv({ text: "基于你的知识库 AI 生成，内容仅供参考", cls: "akos-composer-note" });
  }

  showNodeSummary(data) {
    const node = this.getSelectedNode(data);
    this.aiTitle = `${node.label} · 节点总结`;
    this.aiMessage = `已汇总 ${node.notes.length} 篇关联笔记。`;
    this.searchResults = `${this.nodeSummary(node)} 当前连接强度 ${node.strength.toFixed(2)}，关联 ${node.projects.length} 个项目与 ${node.clients.length} 个客户主题。`;
    void this.render();
  }

  showNodePaths(data) {
    const node = this.getSelectedNode(data);
    const paths = this.getTopicPaths(data, node, 4);
    this.aiTitle = `${node.label} · 关系路径`;
    this.aiMessage = "以下路径全部来自 Vault 中真实存在的 Wikilink。";
    this.searchResults = paths.length
      ? paths.map((entry) => entry.path.map((path) => data.graphIndex.nodes.get(path)?.file.basename || path).join(" → ")).join("；")
      : "当前节点与其他主题之间没有可在设定深度内追溯的 Wikilink 路径。";
    void this.render();
  }

  showNodeGaps(data) {
    const node = this.getSelectedNode(data);
    const gaps = data.nodes.filter((item) => item.notes.length < node.notes.length).sort((a, b) => a.notes.length - b.notes.length).slice(0, 3);
    this.aiTitle = `${node.label} · 知识缺口`;
    this.aiMessage = "基于节点覆盖与孤立笔记生成。";
    const hidden = data.hiddenAssociations.slice(0, 3).map((item) => `建议关联“${item.left.file.basename}”与“${item.right.file.basename}”`).join("；");
    this.searchResults = `建议补充：${gaps.map((item) => `${item.label}（${item.notes.length} 篇）`).join("、")}。当前还有 ${data.base.orphans} 篇孤立笔记需要建立连接。${hidden ? `候选关系：${hidden}。` : ""}`;
    void this.render();
  }

  createGraphReport(data) {
    const node = this.getSelectedNode(data);
    new PromptModal(this.app, "生成知识路径报告", "输入报告名称，将基于当前节点生成本地 Markdown 报告。", async (title) => {
      const name = safeName(title);
      const path = await this.uniquePath(`${ROOT}/Analytics/${name}.md`);
      const paths = this.getTopicPaths(data, node, 4);
      const content = `---\ntitle: ${yamlQuote(name)}\ntype: graph-report\ncreated: ${new Date().toISOString()}\nroot_node: ${yamlQuote(node.label)}\ntags:\n  - report/knowledge-map\n---\n\n# ${name}\n\n## 当前节点\n\n**${node.label}** · ${node.notes.length} 篇笔记 · ${node.links} 条连接\n\n${this.nodeSummary(node)}\n\n## 真实 Wikilink 路径\n\n${paths.length ? paths.map((entry) => `- ${entry.path.map((path) => `[[${path.replace(/\.md$/, "")}]]`).join(" → ")}`).join("\n") : "- 暂无可追溯路径"}\n\n## 建议关联（尚未建立）\n\n${data.hiddenAssociations.slice(0, 5).map((item) => `- [[${item.left.file.path.replace(/\.md$/, "")}]] ↔ [[${item.right.file.path.replace(/\.md$/, "")}]]（${item.common.length} 个共同邻居）`).join("\n") || "- 暂无"}\n\n## 下一步\n\n- [ ] 补充薄弱节点\n- [ ] 审核建议关联后再建立双链\n`;
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf("tab").openFile(file);
      new Notice("知识路径报告已创建");
    }, `${node.label} 知识路径报告`, "生成报告").open();
  }
}

class AIKnowledgeOSSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "AI Knowledge OS 设置" });
    new Setting(containerEl)
      .setName("显示名称")
      .setDesc("用于驾驶舱问候语和 AI Copilot。")
      .addText((text) => text
        .setPlaceholder("Ethan")
        .setValue(this.plugin.settings.userName)
        .onChange(async (value) => {
          this.plugin.settings.userName = value.trim() || "Ethan";
          await this.plugin.saveSettings();
          this.plugin.refreshDashboard();
        }));
    new Setting(containerEl)
      .setName("启动时打开驾驶舱")
      .setDesc("Obsidian 启动后自动进入 AI Knowledge OS。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.openOnStartup)
        .onChange(async (value) => {
          this.plugin.settings.openOnStartup = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("沉浸模式")
      .setDesc("打开驾驶舱时折叠 Obsidian 原生左右侧栏。")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.immersiveMode)
        .onChange(async (value) => {
          this.plugin.settings.immersiveMode = value;
          await this.plugin.saveSettings();
        }));
    containerEl.createEl("h3", { text: "Graph", attr: { id: "akos-settings-graph" } });
    new Setting(containerEl)
      .setName("默认连接深度")
      .setDesc("控制 Knowledge Map 初次打开时展示的卫星节点和路径搜索深度。")
      .addDropdown((dropdown) => dropdown
        .addOption("1", "1 层")
        .addOption("2", "2 层")
        .addOption("3", "3 层")
        .setValue(String(this.plugin.settings.graphDefaultDepth || 2))
        .onChange(async (value) => {
          this.plugin.settings.graphDefaultDepth = Number(value);
          await this.plugin.saveSettings();
        }));
    containerEl.createEl("h3", { text: "Agents", attr: { id: "akos-settings-agents" } });
    const capability = this.plugin.claudianAdapter?.detect?.() || { available: false, compatible: false, version: "" };
    new Setting(containerEl)
      .setName("Claudian 执行器")
      .setDesc(capability.compatible ? `已适配 Claudian ${capability.version}` : capability.available ? `检测到 Claudian ${capability.version || "未知版本"}，当前暂未适配` : "未检测到已启用的 Claudian");
    containerEl.createEl("h3", { text: "Projects", attr: { id: "akos-settings-projects" } });
    new Setting(containerEl)
      .setName("项目数据来源")
      .setDesc(`读取 ${ROOT}/Projects 中的项目笔记、任务、owners 与 agents frontmatter。`);
    containerEl.createEl("h3", { text: "Analytics", attr: { id: "akos-settings-analytics" } });
    new Setting(containerEl)
      .setName("统计数据来源")
      .setDesc("知识增长来自文件创建/修改时间；AI 执行效果只读取 Agents/Runs 的真实任务状态。");
  }
}

class ProjectCenterView extends KnowledgeDashboardView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.selectedProjectPath = null;
    this.projectFilter = "";
    this.selectedProjectCollection = null;
    this.projectAiResponse = null;
    this.renderVersion = 0;
    this.refresh = debounce(() => this.render(), 350);
  }

  getViewType() {
    return PROJECT_VIEW_TYPE;
  }

  getDisplayText() {
    return "Projects · AI Knowledge OS";
  }

  getIcon() {
    return "folder-kanban";
  }

  async onOpen() {
    this.contentEl.addClass("akos-view-content", "akos-project-view-content");
    await this.render();
  }

  async onClose() {
    this.contentEl.removeClass("akos-view-content", "akos-project-view-content");
  }

  normalizeProjectStatus(value) {
    const status = String(value || "planning").toLowerCase();
    if (/(done|complete|completed|closed|已完成)/.test(status)) return "done";
    if (/(active|doing|in.progress|进行中)/.test(status)) return "active";
    if (/(research|discovery|调研)/.test(status)) return "research";
    if (/(develop|building|开发)/.test(status)) return "development";
    return "planning";
  }

  projectStatusLabel(status) {
    return ({ done: "已完成", active: "进行中", research: "需求调研", development: "开发中", planning: "规划中" })[status] || "规划中";
  }

  async getProjectData() {
    const base = this.getStats();
    const files = base.files.filter((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      return cache?.frontmatter?.type === "project" || (file.path.startsWith(`${ROOT}/Projects/`) && file.extension === "md");
    }).filter((file) => !/README|模板/i.test(file.basename));
    const projects = await Promise.all(files.map(async (file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter || {};
      const content = await this.app.vault.cachedRead(file);
      const lines = content.split("\n");
      const tasks = [];
      lines.forEach((line, lineIndex) => {
        const match = line.match(/^\s*-\s*\[([ xX-])\]\s+(.+?)\s*$/);
        if (!match) return;
        tasks.push({ line: lineIndex, done: /[xX-]/.test(match[1]), text: match[2].replace(/\s*📅\s*\d{4}-\d{2}-\d{2}.*/, "").trim() });
      });
      const related = (cache?.links || []).map((link) => this.app.metadataCache.getFirstLinkpathDest(link.link, file.path)).filter((item, index, list) => item instanceof TFile && list.indexOf(item) === index);
      const tags = [];
      const frontmatterTags = frontmatter.tags;
      if (Array.isArray(frontmatterTags)) tags.push(...frontmatterTags.map(String));
      else if (typeof frontmatterTags === "string") tags.push(frontmatterTags);
      (cache?.tags || []).forEach((tag) => tags.push(tag.tag.replace(/^#/, "")));
      const completedTasks = tasks.filter((task) => task.done).length;
      const computedProgress = tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0;
      const progressValue = Number(frontmatter.progress);
      const status = this.normalizeProjectStatus(frontmatter.status);
      const progress = status === "done" ? 100 : Number.isFinite(progressValue) ? Math.max(0, Math.min(100, progressValue)) : computedProgress;
      const plain = cleanMarkdown(content);
      const objectiveMatch = content.match(/>\s*(?:把|将|为|通过)[^\n]{12,180}/);
      const summary = textExcerpt(objectiveMatch?.[0]?.replace(/^>\s*/, "") || plain, 138);
      const client = String(frontmatter.client || frontmatter.customer || (/(客户|交付)/.test(content) ? "企业客户" : "内部项目"));
      const agents = normalizeStringArray(frontmatter.agents).length;
      const meetings = related.filter((item) => /(会议|沟通|交流|纪要|meeting)/i.test(item.path)).length;
      const owners = Array.isArray(frontmatter.owners) ? frontmatter.owners.map(String) : [String(frontmatter.owner || this.plugin.settings.userName || "Ethan")];
      return {
        file, frontmatter, content, title: String(frontmatter.title || file.basename), status, progress,
        nextAction: String(frontmatter.next_action || tasks.find((task) => !task.done)?.text || "明确下一步行动"),
        due: String(frontmatter.due || ""), client, tasks, completedTasks, related, tags: [...new Set(tags)],
        agents, meetings, owners, summary, updated: file.stat.mtime,
      };
    }));
    projects.sort((a, b) => (a.status === "done") - (b.status === "done") || b.updated - a.updated);
    if (!this.selectedProjectPath || !projects.some((project) => project.file.path === this.selectedProjectPath)) this.selectedProjectPath = projects[0]?.file.path || null;
    const selected = projects.find((project) => project.file.path === this.selectedProjectPath) || projects[0] || null;
    const active = projects.filter((project) => project.status !== "done");
    const completed = projects.filter((project) => project.status === "done");
    const pendingTasks = projects.reduce((sum, project) => sum + project.tasks.filter((task) => !task.done).length, 0);
    const weekStart = Date.now() - 7 * 86400000;
    const recent = projects.filter((project) => project.updated >= weekStart);
    const collectionDefinitions = [
      ["企业AI转型", "folder-heart", "purple", /(企业|客户|FDE|转型)/i],
      ["Agent 实施手册", "bot", "blue", /(agent|智能体|claude|codex)/i],
      ["客户需求分析", "users", "teal", /(客户|需求|沟通|会议)/i],
      ["内容生产系统", "package-open", "orange", /(内容|文章|素材|公众号)/i],
    ];
    const collections = collectionDefinitions.map(([title, icon, color, pattern]) => {
      const notes = base.files.filter((file) => pattern.test(`${file.path} ${(this.app.metadataCache.getFileCache(file)?.frontmatter?.tags || "")}`));
      const projectItems = projects.filter((project) => pattern.test(`${project.title} ${project.client} ${project.tags.join(" ")} ${project.content}`));
      const taskCount = notes.reduce((sum, file) => sum + (this.app.metadataCache.getFileCache(file)?.listItems || []).filter((item) => typeof item.task === "string" && !/[xX-]/.test(item.task)).length, 0);
      return { title, icon, color, notes, taskCount, projectItems };
    });
    return { base, projects, selected, active, completed, pendingTasks, recent, collections };
  }

  async render() {
    const version = ++this.renderVersion;
    const data = await this.getProjectData();
    if (version !== this.renderVersion) return;
    const root = this.contentEl;
    root.empty();
    const app = root.createDiv({ cls: "akos-app akos-project-app" });
    this.renderProjectSidebar(app, data);
    const center = app.createDiv({ cls: "akos-center akos-project-center" });
    this.renderProjectTopbar(center, data);
    const scroll = center.createDiv({ cls: "akos-scroll akos-project-scroll" });
    this.renderProjectHeader(scroll);
    this.renderProjectStats(scroll, data);
    if (data.selected) {
      this.renderProjectFocus(scroll, data);
      this.renderProjectWorkspace(scroll, data);
      this.renderProjectBottom(scroll, data);
    } else {
      const empty = scroll.createDiv({ cls: "akos-panel akos-project-empty" });
      createIcon(empty, "folder-plus");
      empty.createEl("h2", { text: "还没有项目" });
      empty.createEl("p", { text: "创建第一份项目笔记后，它会自动出现在这里。" });
      createButton(empty, "创建项目", "plus", "akos-primary-button").addEventListener("click", () => this.createProject());
    }
    this.renderStatus(center, data.base);
    this.renderProjectAssistant(app, data);
  }

  renderProjectSidebar(app, data) {
    super.renderSidebar(app, data.base);
    app.querySelectorAll(".akos-nav-item").forEach((button) => {
      const title = button.querySelector(".akos-nav-title")?.textContent;
      button.classList.toggle("is-active", title === "Projects");
    });
  }

  renderProjectTopbar(center, data) {
    const topbar = center.createDiv({ cls: "akos-topbar" });
    const searchWrap = topbar.createDiv({ cls: "akos-search akos-project-search" });
    createIcon(searchWrap, "search");
    const input = searchWrap.createEl("input", { attr: { type: "search", placeholder: "搜索项目、任务、客户、笔记…", "aria-label": "搜索项目" } });
    input.value = this.projectFilter;
    input.addEventListener("input", () => {
      this.projectFilter = input.value.trim().toLowerCase();
      this.applyProjectFilter();
    });
    searchWrap.createSpan({ text: "⌘ K", cls: "akos-shortcut" });
    const actions = topbar.createDiv({ cls: "akos-top-actions" });
    createButton(actions, "AI 助手", "sparkles", "akos-top-action").addEventListener("click", () => this.focusPrompt());
    createButton(actions, "今日洞察", "clock-3", "akos-top-action").addEventListener("click", () => this.summarizeProject(data.selected));
    const add = createButton(actions, "", "bell", "akos-icon-button");
    bindPlannedFeature(add, FEATURES.notificationCenter.label);
    const avatar = actions.createEl("button", { cls: "akos-avatar-button" });
    avatar.createSpan({ text: (this.plugin.settings.userName || "E").charAt(0).toUpperCase(), cls: "akos-avatar" });
    avatar.createSpan({ text: this.plugin.settings.userName || "Ethan" });
    createIcon(avatar, "chevron-down");
    avatar.addEventListener("click", () => this.plugin.openSettings("projects"));
  }

  renderProjectHeader(parent) {
    const header = parent.createDiv({ cls: "akos-project-header" });
    const copy = header.createDiv();
    copy.createEl("h1", { text: "Projects" });
    copy.createEl("p", { text: "将知识、任务、客户与交付流程组织成可执行的项目系统。" });
    createButton(header, "项目视图设置", "settings", "akos-knowledge-settings").addEventListener("click", () => this.openFile(`${ROOT}/Projects/Projects.base`));
  }

  renderProjectStats(parent, data) {
    const cards = [
      ["进行中项目", data.active.length, "仍在推进", "folder", "purple"],
      ["已完成项目", data.completed.length, "已形成交付", "circle-check-big", "green"],
      ["待处理任务", data.pendingTasks, "需要下一步", "list-checks", "orange"],
      ["本周更新项目", data.recent.length, "最近 7 天", "chart-no-axes-column-increasing", "blue"],
    ];
    const grid = parent.createDiv({ cls: "akos-stat-grid akos-knowledge-stat-grid akos-project-stat-grid" });
    cards.forEach(([label, value, note, icon, color]) => {
      const card = grid.createDiv({ cls: "akos-stat-card" });
      createIcon(card, icon, `akos-stat-icon is-${color}`);
      const copy = card.createDiv({ cls: "akos-stat-copy" });
      copy.createDiv({ text: label, cls: "akos-stat-label" });
      copy.createEl("strong", { text: formatNumber(value) });
      copy.createDiv({ text: note, cls: "akos-stat-trend" });
    });
  }

  renderProjectFocus(parent, data) {
    const project = data.selected;
    const focus = parent.createDiv({ cls: "akos-panel akos-project-focus" });
    const visual = focus.createDiv({ cls: "akos-project-visual" });
    [0, 1, 2].forEach((index) => visual.createSpan({ cls: `akos-project-layer is-${index}` }));
    createIcon(visual, "database-zap");
    const copy = focus.createDiv({ cls: "akos-project-focus-copy" });
    const kicker = copy.createDiv({ cls: "akos-project-kicker" });
    createIcon(kicker, "star");
    kicker.createSpan({ text: "当前重点项目" });
    const heading = copy.createDiv({ cls: "akos-project-focus-heading" });
    heading.createEl("h2", { text: project.title });
    heading.createSpan({ text: this.projectStatusLabel(project.status), cls: `akos-project-status is-${project.status}` });
    copy.createDiv({ text: `客户：${project.client}`, cls: "akos-project-client" });
    copy.createEl("p", { text: project.summary || `下一步：${project.nextAction}` });
    const metrics = copy.createDiv({ cls: "akos-project-focus-metrics" });
    [["关联知识", project.related.length, "book-open"], ["会议记录", project.meetings, "calendar-days"], ["任务", project.tasks.length, "square-check-big"], ["AI Agents", project.agents, "bot"]].forEach(([label, value, icon]) => {
      const metric = metrics.createDiv();
      createIcon(metric, icon);
      const metricCopy = metric.createDiv();
      metricCopy.createEl("strong", { text: formatNumber(value) });
      metricCopy.createSpan({ text: label });
    });
    const progress = focus.createDiv({ cls: "akos-project-focus-progress" });
    progress.createSpan({ text: "项目进度" });
    progress.createEl("strong", { text: `${project.progress}%` });
    const meter = progress.createDiv({ cls: "akos-project-progress-meter" });
    meter.createSpan({ attr: { style: `width:${project.progress}%` } });
    progress.createDiv({ text: project.due ? `预计完成：${project.due}` : `下一步：${project.nextAction}` });
    const actions = progress.createDiv({ cls: "akos-project-focus-actions" });
    createButton(actions, "查看项目详情", "arrow-right", "akos-primary-button").addEventListener("click", () => this.openFile(project.file.path));
    createButton(actions, "生成周报", "file-text", "akos-secondary-button").addEventListener("click", () => this.generateWeeklyReport(project));
  }

  renderProjectWorkspace(parent, data) {
    const workspace = parent.createDiv({ cls: "akos-project-workspace" });
    const list = workspace.createDiv({ cls: "akos-panel akos-project-list" });
    const listHeader = list.createDiv({ cls: "akos-project-section-head" });
    listHeader.createEl("h2", { text: "项目列表" });
    listHeader.createSpan({ text: String(data.projects.length) });
    const tableHead = list.createDiv({ cls: "akos-project-table-head" });
    ["项目名称", "客户", "状态", "进度", "更新时间", "负责人"].forEach((label) => tableHead.createSpan({ text: label }));
    const rows = list.createDiv({ cls: "akos-project-rows" });
    const collection = data.collections.find((item) => item.title === this.selectedProjectCollection);
    const visibleProjects = collection ? collection.projectItems : data.projects;
    visibleProjects.forEach((project) => {
      const row = rows.createEl("button", { cls: `akos-project-row${project.file.path === data.selected.file.path ? " is-selected" : ""}` });
      row.dataset.search = `${project.title} ${project.client} ${project.tasks.map((task) => task.text).join(" ")}`.toLowerCase();
      const name = row.createDiv({ cls: "akos-project-row-name" });
      createIcon(name, "folder-kanban");
      name.createSpan({ text: project.title });
      row.createSpan({ text: project.client });
      row.createSpan({ text: this.projectStatusLabel(project.status), cls: `akos-project-status is-${project.status}` });
      const progress = row.createDiv({ cls: "akos-project-row-progress" });
      progress.createSpan({ text: `${project.progress}%` });
      const meter = progress.createDiv();
      meter.createSpan({ attr: { style: `width:${project.progress}%` } });
      row.createSpan({ text: formatRelativeTime(project.updated) });
      const owner = row.createDiv({ cls: "akos-project-owner" });
      owner.createSpan({ text: project.owners[0].charAt(0).toUpperCase() });
      owner.createSpan({ text: project.owners[0] });
      row.addEventListener("click", () => {
        this.selectedProjectPath = project.file.path;
        this.projectAiResponse = null;
        void this.render();
      });
    });
    const milestone = workspace.createDiv({ cls: "akos-panel akos-project-milestones" });
    const title = milestone.createDiv({ cls: "akos-project-section-head" });
    title.createEl("h2", { text: "交付里程碑" });
    const tasks = data.selected.tasks.slice(0, 5);
    if (!tasks.length) milestone.createDiv({ text: "项目暂时没有任务", cls: "akos-project-muted" });
    tasks.forEach((task, index) => {
      const item = milestone.createEl("button", { cls: `akos-project-milestone${task.done ? " is-done" : ""}${!task.done && index === tasks.findIndex((item) => !item.done) ? " is-current" : ""}` });
      item.createSpan({ text: task.done ? "✓" : String(index + 1) });
      const taskCopy = item.createDiv();
      taskCopy.createEl("strong", { text: task.text });
      taskCopy.createSpan({ text: task.done ? "已完成" : index === tasks.findIndex((entry) => !entry.done) ? "进行中" : "待开始" });
      item.addEventListener("click", () => this.toggleProjectTask(data.selected, task));
    });
  }

  renderProjectBottom(parent, data) {
    const bottom = parent.createDiv({ cls: "akos-project-bottom" });
    const collections = bottom.createDiv({ cls: "akos-panel akos-project-collections" });
    const heading = collections.createDiv({ cls: "akos-project-section-head" });
    heading.createEl("h2", { text: "项目精选" });
    const viewAll = heading.createEl("button", { text: "查看全部 →", cls: "akos-project-link" });
    bindPlannedFeature(viewAll, FEATURES.viewAllProjects.label);
    const grid = collections.createDiv({ cls: "akos-project-collection-grid" });
    data.collections.forEach((collection) => {
      const card = grid.createEl("button", { cls: `akos-project-collection is-${collection.color}` });
      createIcon(card, collection.icon);
      card.createEl("strong", { text: collection.title });
      const counts = card.createDiv();
      counts.createSpan({ text: `${collection.notes.length} 笔记` });
      counts.createSpan({ text: `${collection.taskCount} 任务` });
      card.createEl("small", { text: collection.notes[0] ? `更新于 ${formatRelativeTime(collection.notes[0].stat.mtime)}` : "等待收录" });
      card.addEventListener("click", () => {
        this.selectedProjectCollection = this.selectedProjectCollection === collection.title ? null : collection.title;
        if (this.selectedProjectCollection && collection.projectItems[0]) this.selectedProjectPath = collection.projectItems[0].file.path;
        void this.render();
      });
    });
    const next = bottom.createDiv({ cls: "akos-panel akos-project-next" });
    const nextHead = next.createDiv({ cls: "akos-project-section-head" });
    nextHead.createEl("h2", { text: "下一步任务" });
    data.selected.tasks.filter((task) => !task.done).slice(0, 4).forEach((task) => {
      const item = next.createEl("button");
      createIcon(item, "square");
      item.createSpan({ text: task.text });
      item.addEventListener("click", () => this.toggleProjectTask(data.selected, task));
    });
    const team = bottom.createDiv({ cls: "akos-panel akos-project-team" });
    const teamHead = team.createDiv({ cls: "akos-project-section-head" });
    teamHead.createEl("h2", { text: "项目协作" });
    data.selected.owners.forEach((owner, index) => {
      const person = team.createDiv({ cls: "akos-project-person" });
      person.createSpan({ text: owner.charAt(0).toUpperCase() });
      person.createEl("strong", { text: owner });
      person.createEl("small", { text: index === 0 ? "项目负责人" : "协作成员" });
    });
    const invite = createButton(team, "邀请成员", "plus", "akos-project-invite");
    invite.addEventListener("click", () => new ProjectOwnersModal(this.app, data.selected, async (owners) => {
      await this.app.fileManager.processFrontMatter(data.selected.file, (frontmatter) => { frontmatter.owners = owners; });
      new Notice("项目成员已更新");
      await this.render();
    }).open());
  }

  renderProjectAssistant(app, data) {
    const project = data.selected;
    const aside = app.createEl("aside", { cls: "akos-copilot akos-project-assistant" });
    app.toggleClass("is-copilot-collapsed", this.copilotCollapsed);
    aside.toggleClass("is-collapsed", this.copilotCollapsed);
    const header = aside.createDiv({ cls: "akos-copilot-header" });
    const title = header.createDiv({ cls: "akos-copilot-title" });
    createIcon(title, "sparkles");
    title.createEl("strong", { text: "AI 助手" });
    const toggle = createButton(header, "", this.copilotCollapsed ? "panel-left-open" : "panel-right-close", "akos-icon-button akos-assistant-toggle");
    toggle.setAttr("aria-label", this.copilotCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.addEventListener("click", () => {
      this.copilotCollapsed = !this.copilotCollapsed;
      void this.render();
    });
    const scroll = aside.createDiv({ cls: "akos-copilot-scroll akos-project-assistant-scroll" });
    const intro = scroll.createDiv({ cls: "akos-copilot-intro" });
    intro.createEl("h2", { text: `你好，${this.plugin.settings.userName || "Ethan"} 👋` });
    intro.createEl("p", { text: "我能帮你总结项目进度、整理交付并提前发现风险。" });
    const suggestions = scroll.createDiv({ cls: "akos-project-ai-actions" });
    [["总结当前项目进度", "timer", () => this.summarizeProject(project)], ["生成项目周报", "square-check-big", () => this.generateWeeklyReport(project)], ["查找相关知识和关联", "network", () => this.showProjectRelations(project)], ["输出客户方案草稿", "notebook-pen", () => this.openClaudian(`请基于项目「${project?.title || "当前项目"}」输出客户方案草稿。`)], ["识别交付风险", "cloud-alert", () => this.identifyProjectRisk(project)]].forEach(([label, icon, action]) => {
      createButton(suggestions, label, icon, "akos-project-ai-action").addEventListener("click", action);
    });
    if (project) {
      const overview = scroll.createDiv({ cls: "akos-project-ai-overview" });
      overview.createEl("h3", { text: "当前项目概览" });
      const metrics = overview.createDiv();
      [["项目数量", data.projects.length, "briefcase-business", "blue"], ["进行中", data.active.length, "clock-3", "green"], ["任务总数", data.projects.reduce((sum, item) => sum + item.tasks.length, 0), "list-checks", "orange"], ["关联知识", project.related.length, "book-open", "cyan"]].forEach(([label, value, icon, color]) => {
        const item = metrics.createDiv();
        createIcon(item, icon, `is-${color}`);
        item.createEl("strong", { text: formatNumber(value) });
        item.createSpan({ text: label });
      });
      const tags = overview.createDiv({ cls: "akos-project-ai-tags" });
      [...new Set(["企业AI", "知识库", "交付中", "RAG", ...project.tags])].slice(0, 7).forEach((tag) => tags.createSpan({ text: `#${tag.replace(/^#/, "")}` }));
    }
    if (this.projectAiResponse) {
      const response = scroll.createDiv({ cls: "akos-ai-response is-visible" });
      response.createEl("strong", { text: this.projectAiResponse.title });
      response.createEl("p", { text: this.projectAiResponse.text });
      if (this.projectAiResponse.sources?.length) {
        const sources = response.createDiv({ cls: "akos-project-search-sources" });
        this.projectAiResponse.sources.forEach((result) => {
          const button = createButton(sources, result.file.basename, "file-text", "akos-search-result");
          button.addEventListener("click", () => this.openFile(result.file.path));
        });
      }
    }
    const composer = aside.createDiv({ cls: "akos-composer akos-project-composer" });
    const input = composer.createEl("textarea", { cls: "akos-prompt", attr: { placeholder: "Ask your project…", "aria-label": "询问项目助手" } });
    const composerActions = composer.createDiv({ cls: "akos-composer-actions" });
    createPlannedIconButton(composerActions, "paperclip", "assistantAttachment");
    createPlannedIconButton(composerActions, "at-sign", "assistantMention");
    createPlannedIconButton(composerActions, "smile", "emojiPicker");
    createButton(composerActions, "", "send-horizontal", "akos-send").addEventListener("click", () => {
      const query = input.value.trim();
      if (!query) return;
      void this.searchProjectKnowledge(project, query);
    });
    composer.createDiv({ text: "基于你的本地项目与知识库生成，内容仅供参考", cls: "akos-composer-note" });
  }

  async searchProjectKnowledge(project, query) {
    if (!project) return;
    const words = query.toLowerCase().split(/[\s，。；、]+/).filter(Boolean);
    const candidates = [...new Set([project.file, ...project.related, ...this.app.vault.getMarkdownFiles()])];
    const results = [];
    for (const file of candidates) {
      const text = await this.app.vault.cachedRead(file);
      const haystack = `${file.basename} ${text}`.toLowerCase();
      let score = file.path === project.file.path ? 5 : project.related.includes(file) ? 3 : 0;
      words.forEach((word) => { score += Math.min(8, haystack.split(word).length - 1); });
      if (score > 0) results.push({ file, score });
    }
    results.sort((a, b) => b.score - a.score || b.file.stat.mtime - a.file.stat.mtime);
    const top = results.slice(0, 8);
    this.projectAiResponse = {
      title: "项目知识检索",
      text: top.length
        ? `围绕“${query}”找到 ${top.length} 个本地来源：${top.map((item) => item.file.basename).join("、")}。`
        : `当前项目和本地知识库中没有找到“${query}”的直接匹配。`,
      sources: top,
    };
    void this.render();
  }

  applyProjectFilter() {
    this.contentEl.querySelectorAll(".akos-project-row").forEach((row) => row.toggleClass("is-filtered", !!this.projectFilter && !row.dataset.search.includes(this.projectFilter)));
  }

  async toggleProjectTask(project, task) {
    const content = await this.app.vault.cachedRead(project.file);
    const lines = content.split("\n");
    const current = lines[task.line];
    if (!current || !/^\s*-\s*\[[ xX-]\]/.test(current)) return;
    lines[task.line] = current.replace(/\[([ xX-])\]/, task.done ? "[ ]" : "[x]");
    await this.app.vault.modify(project.file, lines.join("\n"));
    const allTasks = lines.filter((line) => /^\s*-\s*\[[ xX-]\]/.test(line));
    const doneTasks = allTasks.filter((line) => /^\s*-\s*\[[xX-]\]/.test(line));
    await this.app.fileManager.processFrontMatter(project.file, (frontmatter) => {
      frontmatter.progress = allTasks.length ? Math.round(doneTasks.length / allTasks.length * 100) : Number(frontmatter.progress || 0);
      if (allTasks.length && doneTasks.length === allTasks.length) frontmatter.status = "done";
      else if (frontmatter.status === "done") frontmatter.status = "active";
    });
    new Notice(task.done ? "任务已重新打开" : "任务已完成");
    await this.render();
  }

  summarizeProject(project) {
    if (!project) return;
    const open = project.tasks.filter((task) => !task.done);
    this.projectAiResponse = { title: `${project.title} · 进度摘要`, text: `当前完成度 ${project.progress}%，已完成 ${project.completedTasks}/${project.tasks.length} 项任务。${open.length ? `下一步优先推进“${open[0].text}”。` : "当前任务已经全部完成。"}` };
    void this.render();
  }

  showProjectRelations(project) {
    if (!project) return;
    const names = project.related.slice(0, 5).map((file) => file.basename).join("、") || "暂无直接双链";
    this.projectAiResponse = { title: "关联知识", text: `找到 ${project.related.length} 篇直接关联笔记：${names}。` };
    void this.render();
  }

  identifyProjectRisk(project) {
    if (!project) return;
    const due = project.due ? new Date(project.due).getTime() : 0;
    const overdue = due && due < Date.now() && project.status !== "done";
    const risk = overdue ? "截止日期已过，需要重新确认交付范围与时间。" : project.progress < 35 ? "项目仍处早期，建议优先固化成功标准与验收问题集。" : project.tasks.some((task) => !task.done) ? `当前主要风险是“${project.tasks.find((task) => !task.done).text}”尚未闭环。` : "未发现明显的任务阻塞。";
    this.projectAiResponse = { title: `${project.title} · 交付风险`, text: risk };
    void this.render();
  }

  async generateWeeklyReport(project) {
    if (!project) return;
    const date = new Date().toISOString().slice(0, 10);
    const path = await this.uniquePath(`${ROOT}/Analytics/${date}-${safeName(project.title)}-项目周报.md`);
    const completed = project.tasks.filter((task) => task.done).map((task) => `- [x] ${task.text}`).join("\n") || "- 暂无";
    const pending = project.tasks.filter((task) => !task.done).map((task) => `- [ ] ${task.text}`).join("\n") || "- 暂无";
    const content = `---\ntitle: "${date} ${project.title}项目周报"\ntype: report\nproject: "[[${project.file.path.replace(/\.md$/, "")}]]"\ncreated: ${new Date().toISOString()}\ntags:\n  - report/project\n---\n\n# ${project.title} · 项目周报\n\n## 本周状态\n\n- 进度：${project.progress}%\n- 状态：${this.projectStatusLabel(project.status)}\n- 下一步：${project.nextAction}\n\n## 已完成\n\n${completed}\n\n## 下一步任务\n\n${pending}\n\n## 风险与决策\n\n- [ ] 补充本周风险与需要确认的决策\n`;
    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf("tab").openFile(file);
    new Notice("项目周报已生成");
  }
}

class AgentCenterView extends KnowledgeDashboardView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.selectedAgentId = "organizer";
    this.agentAiResponse = null;
    this.renderVersion = 0;
    this.refresh = debounce(() => this.render(), 350);
  }

  getViewType() { return AGENT_VIEW_TYPE; }
  getDisplayText() { return "AI Agents · AI Knowledge OS"; }
  getIcon() { return "bot"; }

  async onOpen() {
    this.contentEl.addClass("akos-view-content", "akos-agent-view-content");
    await this.render();
  }

  async onClose() {
    this.contentEl.removeClass("akos-view-content", "akos-agent-view-content");
  }

  getAgentData() {
    const base = this.getStats();
    const executions = [];
    base.files.forEach((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter?.type !== "agent-run" || !file.path.startsWith(`${ROOT}/Agents/Runs/`)) return;
      const agentId = cache?.frontmatter?.agent_id;
      if (!agentId) return;
      executions.push({
        file,
        agentId: String(agentId),
        status: String(cache.frontmatter.status || AGENT_RUN_STATUSES.DRAFT),
        task: String(cache.frontmatter.task || file.basename),
        duration: String(cache.frontmatter.duration || "本地任务"),
        outputFile: String(cache.frontmatter.output_file || ""),
        reviewed: Boolean(cache.frontmatter.reviewed),
        updated: file.stat.mtime,
      });
    });
    executions.sort((a, b) => b.updated - a.updated);
    const agents = AGENT_DEFINITIONS.map((definition) => {
      const related = base.files.filter((file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        return definition.pattern.test(`${file.path} ${JSON.stringify(cache?.frontmatter || {})}`);
      });
      const runs = executions.filter((execution) => execution.agentId === definition.id);
      return { ...definition, related, runs, lastRun: runs[0]?.updated || 0, status: runs[0]?.status || "ready" };
    });
    const selected = agents.find((agent) => agent.id === this.selectedAgentId) || agents[0];
    const weekStart = Date.now() - 7 * 86400000;
    const weekRuns = executions.filter((execution) => execution.updated >= weekStart);
    const successful = executions.filter((execution) => /success|done|completed|成功/i.test(execution.status)).length;
    return { base, agents, selected, executions, weekRuns, successRate: executions.length ? Math.round(successful / executions.length * 100) : null };
  }

  async render() {
    const version = ++this.renderVersion;
    const data = this.getAgentData();
    if (version !== this.renderVersion) return;
    const root = this.contentEl;
    root.empty();
    const app = root.createDiv({ cls: "akos-app akos-agent-app" });
    this.renderAgentSidebar(app, data);
    const center = app.createDiv({ cls: "akos-center akos-agent-center" });
    this.renderAgentTopbar(center, data);
    const scroll = center.createDiv({ cls: "akos-scroll akos-agent-scroll" });
    this.renderAgentHeader(scroll);
    this.renderAgentStats(scroll, data);
    this.renderAgentFeatured(scroll, data);
    this.renderAgentCards(scroll, data);
    this.renderAgentWorkflow(scroll, data);
    this.renderAgentExecutions(scroll, data);
    this.renderStatus(center, data.base);
    this.renderAgentAssistant(app, data);
  }

  renderAgentSidebar(app, data) {
    super.renderSidebar(app, data.base);
    app.querySelectorAll(".akos-nav-item").forEach((button) => button.classList.toggle("is-active", button.querySelector(".akos-nav-title")?.textContent === "AI Agents"));
  }

  renderAgentTopbar(center, data) {
    const topbar = center.createDiv({ cls: "akos-topbar" });
    const searchWrap = topbar.createDiv({ cls: "akos-search akos-agent-search" });
    createIcon(searchWrap, "search");
    const input = searchWrap.createEl("input", { attr: { type: "search", placeholder: "搜索知识库、任务、客户、笔记…", "aria-label": "搜索智能体" } });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const query = input.value.trim().toLowerCase();
      const match = data.agents.find((agent) => `${agent.name} ${agent.description}`.toLowerCase().includes(query));
      if (match) { this.selectedAgentId = match.id; void this.render(); }
      else if (query) this.runKnowledgeSearch(query);
    });
    searchWrap.createSpan({ text: "⌘ K", cls: "akos-shortcut" });
    const actions = topbar.createDiv({ cls: "akos-top-actions" });
    createButton(actions, "AI 助手", "sparkles", "akos-top-action").addEventListener("click", () => this.focusPrompt());
    createButton(actions, "今日洞察", "clock-3", "akos-top-action").addEventListener("click", () => this.summarizeAgents(data));
    const bell = createButton(actions, "", "bell", "akos-icon-button");
    bindPlannedFeature(bell, FEATURES.notificationCenter.label);
    const avatar = actions.createEl("button", { cls: "akos-avatar-button" });
    avatar.createSpan({ text: (this.plugin.settings.userName || "E").charAt(0).toUpperCase(), cls: "akos-avatar" });
    avatar.createSpan({ text: this.plugin.settings.userName || "Ethan" });
    createIcon(avatar, "chevron-down");
    avatar.addEventListener("click", () => this.plugin.openSettings("agents"));
  }

  renderAgentHeader(parent) {
    const header = parent.createDiv({ cls: "akos-agent-header" });
    const copy = header.createDiv();
    copy.createEl("h1", { text: "AI Agents" });
    copy.createEl("p", { text: "Agent Marketplace · 连接知识、工作流与执行的智能员工中心。" });
    createButton(header, "智能体设置", "settings", "akos-knowledge-settings").addEventListener("click", () => this.plugin.openSettings("agents"));
  }

  renderAgentStats(parent, data) {
    const cards = [
      ["启用中的 Agents", data.agents.length, "本地可用", "bot", "purple"],
      ["自动化任务", data.base.tasks, "待执行任务", "zap", "blue"],
      ["本周执行", data.weekRuns.length, "真实运行记录", "trending-up", "teal"],
      ["平均成功率", data.successRate === null ? "—" : `${data.successRate}%`, data.executions.length ? "基于执行记录" : "等待首次运行", "target", "orange"],
    ];
    const grid = parent.createDiv({ cls: "akos-stat-grid akos-knowledge-stat-grid akos-agent-stat-grid" });
    cards.forEach(([label, value, note, icon, color]) => {
      const card = grid.createDiv({ cls: "akos-stat-card" });
      createIcon(card, icon, `akos-stat-icon is-${color}`);
      const copy = card.createDiv({ cls: "akos-stat-copy" });
      copy.createDiv({ text: label, cls: "akos-stat-label" });
      copy.createEl("strong", { text: String(value) });
      copy.createDiv({ text: note, cls: "akos-stat-trend" });
    });
  }

  renderAgentFeatured(parent, data) {
    const agent = data.selected;
    const featured = parent.createDiv({ cls: "akos-panel akos-agent-featured" });
    const visual = featured.createDiv({ cls: "akos-agent-visual" });
    const orbit = visual.createDiv({ cls: "akos-agent-orbit" });
    orbit.createSpan(); orbit.createSpan(); orbit.createSpan();
    createIcon(visual, agent.icon);
    const copy = featured.createDiv({ cls: "akos-agent-featured-copy" });
    const heading = copy.createDiv({ cls: "akos-agent-featured-heading" });
    createIcon(heading, agent.icon, `is-${agent.color}`);
    heading.createEl("h2", { text: agent.name });
    heading.createSpan({ text: this.agentStatusLabel(agent.status), cls: "akos-agent-running" });
    copy.createEl("p", { text: agent.description });
    const metrics = copy.createDiv({ cls: "akos-agent-featured-metrics" });
    [["关联知识", agent.related.length, "lock-keyhole"], ["连接工具", this.integrationCount(), "plug-zap"], ["最近执行", agent.lastRun ? formatRelativeTime(agent.lastRun) : "未运行", "clock-3"], ["输出类型", agent.output, "shield-check"]].forEach(([label, value, icon]) => {
      const item = metrics.createDiv();
      createIcon(item, icon);
      item.createSpan({ text: label });
      item.createEl("strong", { text: String(value) });
    });
    const actions = copy.createDiv({ cls: "akos-agent-featured-actions" });
    createButton(actions, "查看详情", "scan-eye", "akos-secondary-button").addEventListener("click", () => this.openFile(this.plugin.agentTaskStore.definitionPath(agent)));
    createButton(actions, "立即运行", "play", "akos-primary-button").addEventListener("click", () => this.runAgent(agent));
    const timeline = featured.createDiv({ cls: "akos-agent-timeline" });
    timeline.createEl("h3", { text: "能力与输出" });
    [["读取本地知识库", `${agent.related.length} 篇可用上下文`], ["结构化推理", "按职责模板处理"], ["保存为 Markdown", `输出：${agent.output}`]].forEach(([title, note]) => {
      const item = timeline.createDiv();
      item.createSpan();
      const itemCopy = item.createDiv();
      itemCopy.createEl("strong", { text: title });
      itemCopy.createEl("small", { text: note });
    });
  }

  renderAgentCards(parent, data) {
    const section = parent.createDiv({ cls: "akos-agent-mine" });
    const head = section.createDiv({ cls: "akos-agent-section-head" });
    head.createEl("h2", { text: "我的 Agents" });
    head.createSpan({ text: String(data.agents.length) });
    bindPlannedFeature(head.createEl("button", { text: "查看全部 Agents →" }), FEATURES.viewAllAgents.label);
    const grid = section.createDiv({ cls: "akos-agent-grid" });
    data.agents.forEach((agent) => {
      const card = grid.createEl("button", { cls: `akos-agent-card is-${agent.color}${agent.id === this.selectedAgentId ? " is-selected" : ""}` });
      const title = card.createDiv({ cls: "akos-agent-card-title" });
      createIcon(title, agent.icon);
      const titleCopy = title.createDiv();
      const agentName = titleCopy.createEl("strong", { text: agent.name });
      agentName.setAttr("title", agent.name);
      titleCopy.createSpan({ text: this.agentStatusLabel(agent.status) });
      card.createEl("p", { text: agent.description });
      const footer = card.createDiv({ cls: "akos-agent-card-footer" });
      const meta = footer.createDiv({ cls: "akos-agent-card-meta" });
      [["触发", agent.trigger], ["知识", `${agent.related.length} 篇`]].forEach(([label, value]) => {
        const item = meta.createDiv({ cls: "akos-agent-card-meta-item" });
        item.createSpan({ text: label });
        item.createEl("strong", { text: value });
      });
      const run = footer.createSpan({ cls: "akos-agent-card-run" });
      createIcon(run, "play");
      card.addEventListener("click", () => { this.selectedAgentId = agent.id; void this.render(); });
      run.addEventListener("click", (event) => { event.stopPropagation(); void this.runAgent(agent); });
    });
  }

  renderAgentWorkflow(parent, data) {
    const panel = parent.createDiv({ cls: "akos-panel akos-agent-workflow" });
    const head = panel.createDiv({ cls: "akos-agent-section-head" });
    head.createEl("h2", { text: `智能体工作流程（${data.selected.name}）` });
    const flow = panel.createDiv({ cls: "akos-agent-flow" });
    [["输入知识库", "加载笔记、文档与链接关系", "folder-open", "purple"], ["模型推理", "提取主题、证据与关键重点", "brain-circuit", "blue"], ["工具调用", "检索、标签与关系构建", "wrench", "teal"], ["输出报告/方案/内容", "保存为可复用 Markdown", "file-text", "purple"]].forEach(([title, note, icon, color], index) => {
      const step = flow.createDiv({ cls: `akos-agent-flow-step is-${color}` });
      createIcon(step, icon);
      const stepCopy = step.createDiv();
      stepCopy.createEl("strong", { text: title });
      stepCopy.createSpan({ text: note });
      if (index < 3) createIcon(flow, "arrow-right", "akos-agent-flow-arrow");
    });
  }

  renderAgentExecutions(parent, data) {
    const panel = parent.createDiv({ cls: "akos-panel akos-agent-executions" });
    const head = panel.createDiv({ cls: "akos-agent-section-head" });
    head.createEl("h2", { text: "最近执行记录" });
    bindPlannedFeature(head.createEl("button", { text: "查看全部记录 →" }), FEATURES.viewAllExecutions.label);
    const header = panel.createDiv({ cls: "akos-agent-execution-row is-head" });
    ["Agent", "任务名称", "状态", "耗时", "更新时间"].forEach((label) => header.createSpan({ text: label }));
    if (!data.executions.length) panel.createDiv({ text: "尚无真实执行记录。点击任一 Agent 的“立即运行”开始。", cls: "akos-agent-empty-runs" });
    data.executions.slice(0, 5).forEach((execution) => {
      const agent = data.agents.find((item) => item.id === execution.agentId) || { name: "Knowledge OS 助手", icon: "sparkles" };
      const row = panel.createDiv({ cls: "akos-agent-execution-row" });
      const name = row.createDiv(); createIcon(name, agent.icon); name.createSpan({ text: agent.name });
      row.createSpan({ text: execution.task });
      row.createSpan({ text: this.agentStatusLabel(execution.status), cls: `akos-agent-run-status is-${execution.status}` });
      row.createSpan({ text: execution.duration });
      row.createSpan({ text: formatRelativeTime(execution.updated) });
      const open = createButton(row, "", "external-link", "akos-agent-run-open");
      open.setAttr("aria-label", "打开执行记录");
      open.addEventListener("click", () => this.openFile(execution.file.path));
      if (execution.status === AGENT_RUN_STATUSES.WAITING_REVIEW) {
        const approve = createButton(row, "验收", "check", "akos-agent-run-approve");
        approve.addEventListener("click", () => this.approveExecution(execution));
      }
    });
  }

  renderAgentAssistant(app, data) {
    const aside = app.createEl("aside", { cls: "akos-copilot akos-agent-assistant" });
    app.toggleClass("is-copilot-collapsed", this.copilotCollapsed);
    aside.toggleClass("is-collapsed", this.copilotCollapsed);
    const header = aside.createDiv({ cls: "akos-copilot-header" });
    const title = header.createDiv({ cls: "akos-copilot-title" }); createIcon(title, "sparkles"); title.createEl("strong", { text: "AI 助手" });
    const toggle = createButton(header, "", this.copilotCollapsed ? "panel-left-open" : "panel-right-close", "akos-icon-button akos-assistant-toggle");
    toggle.setAttr("aria-label", this.copilotCollapsed ? "展开 AI 助手" : "收起 AI 助手");
    toggle.addEventListener("click", () => { this.copilotCollapsed = !this.copilotCollapsed; void this.render(); });
    const scroll = aside.createDiv({ cls: "akos-copilot-scroll akos-agent-assistant-scroll" });
    const intro = scroll.createDiv({ cls: "akos-copilot-intro" });
    intro.createEl("h2", { text: `你好，${this.plugin.settings.userName || "Ethan"} 👋` });
    intro.createEl("p", { text: "我是你的智能体管理助手，帮助你打造更强大的 AI 团队。" });
    const actions = scroll.createDiv({ cls: "akos-agent-ai-actions" });
    [["总结当前 Agent 状态", "bot", () => this.summarizeAgents(data)], ["生成新的 Agent 方案", "square-pen", () => this.openClaudian("请为我的 Obsidian 知识库设计一个新的专职 Agent。")], ["查找相关知识和关联", "network", () => this.agentRelations(data)], ["分析执行效果", "scan-search", () => this.summarizeAgents(data)], ["发现自动化机会", "orbit", () => this.automationIdeas(data)]].forEach(([label, icon, action]) => createButton(actions, label, icon, "akos-agent-ai-action").addEventListener("click", action));
    const overview = scroll.createDiv({ cls: "akos-agent-ai-overview" });
    overview.createEl("h3", { text: "当前 Agent 概览" });
    const metrics = overview.createDiv();
    [["启用数量", data.agents.length, "bot", "purple"], ["运行记录", data.executions.length, "activity", "teal"], ["本周执行", data.weekRuns.length, "trending-up", "blue"], ["成功率", data.successRate === null ? "—" : `${data.successRate}%`, "target", "orange"]].forEach(([label, value, icon, color]) => {
      const item = metrics.createDiv(); createIcon(item, icon, `is-${color}`); item.createEl("strong", { text: String(value) }); item.createSpan({ text: label });
    });
    const tags = overview.createDiv({ cls: "akos-agent-ai-tags" });
    ["#AIAgent", "#自动化", "#知识库", "#工作流", "#工具集成", "#洞察分析"].forEach((tag) => tags.createSpan({ text: tag }));
    const tools = scroll.createDiv({ cls: "akos-agent-tools" });
    tools.createEl("h3", { text: "集成工具与模型" });
    ["Claudian", "Local Vault", "Web Clipper"].forEach((tool) => tools.createSpan({ text: tool }));
    ["Database", "Email", "Feishu"].forEach((tool) => bindPlannedFeature(tools.createEl("button", { text: tool }), `${tool} 集成`));
    if (this.agentAiResponse) {
      const response = scroll.createDiv({ cls: "akos-ai-response is-visible" });
      response.createEl("strong", { text: this.agentAiResponse.title });
      response.createEl("p", { text: this.agentAiResponse.text });
    }
    const composer = aside.createDiv({ cls: "akos-composer akos-agent-composer" });
    const input = composer.createEl("textarea", { cls: "akos-prompt", attr: { placeholder: "Ask your agents…", "aria-label": "询问智能体助手" } });
    const actionsRow = composer.createDiv({ cls: "akos-composer-actions" });
    createPlannedIconButton(actionsRow, "paperclip", "assistantAttachment");
    createPlannedIconButton(actionsRow, "at-sign", "assistantMention");
    createPlannedIconButton(actionsRow, "smile", "emojiPicker");
    createButton(actionsRow, "", "send-horizontal", "akos-send").addEventListener("click", () => input.value.trim() && this.openClaudian(input.value.trim()));
    composer.createDiv({ text: "基于你的本地知识库生成，内容仅供参考", cls: "akos-composer-note" });
  }

  summarizeAgents(data) {
    this.agentAiResponse = { title: "智能体状态", text: `当前启用 ${data.agents.length} 个 Agent，记录了 ${data.executions.length} 次真实运行；${data.executions.length ? `成功率 ${data.successRate}%。` : "建议先从知识库整理 Agent 开始首次运行。"}` };
    void this.render();
  }

  agentRelations(data) {
    const agent = data.selected;
    this.agentAiResponse = { title: `${agent.name} · 关联知识`, text: `找到 ${agent.related.length} 篇可用的本地上下文，运行时会优先载入与“${agent.description.split("，")[0]}”相关的内容。` };
    void this.render();
  }

  automationIdeas(data) {
    const pending = data.base.tasks;
    this.agentAiResponse = { title: "自动化机会", text: pending ? `知识库中有 ${pending} 个未完成任务，可优先把重复的整理、总结和项目汇报交给专职 Agent。` : "当前没有明显的待办积压，可以从每周知识复盘开始自动化。" };
    void this.render();
  }

  integrationCount() {
    return 2 + Number(this.plugin.claudianAdapter.detect().compatible);
  }

  async runAgent(agent) {
    const sourceList = agent.related.slice(0, 5).map((file) => file.basename).join("、") || "当前知识库";
    const prompt = `你是“${agent.name}”。${agent.description}\n\n请基于这些本地来源完成任务：${sourceList}。输出类型：${agent.output}。请区分事实、推断和建议，并明确引用来源。`;
    await this.plugin.executeAgent(agent, prompt, agent.related.slice(0, 5));
  }

  agentStatusLabel(status) {
    return ({
      ready: "就绪",
      draft: "草稿",
      queued: "排队中",
      running: "运行中",
      "waiting-review": "待验收",
      success: "成功",
      failed: "失败",
      blocked: "已阻塞",
      cancelled: "已取消",
    })[status] || String(status || "就绪");
  }

  async approveExecution(execution) {
    try {
      await this.plugin.agentTaskStore.approve(execution.file);
      new Notice("Agent 输出已验收通过");
      await this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }
}

class KnowledgeAnalyticsView extends KnowledgeDashboardView {
  constructor(leaf, plugin) {
    super(leaf, plugin);
    this.analyticsAiResponse = null;
    this.renderVersion = 0;
    this.refresh = debounce(() => this.render(), 350);
  }

  getViewType() { return ANALYTICS_VIEW_TYPE; }
  getDisplayText() { return "Analytics · AI Knowledge OS"; }
  getIcon() { return "chart-no-axes-combined"; }

  async onOpen() {
    this.contentEl.addClass("akos-view-content", "akos-analytics-view-content");
    await this.render();
  }

  async onClose() {
    this.contentEl.removeClass("akos-view-content", "akos-analytics-view-content");
  }

  async getAnalyticsData() {
    const base = this.getStats();
    const resolved = this.app.metadataCache.resolvedLinks || {};
    const inbound = new Map(base.files.map((file) => [file.path, 0]));
    Object.values(resolved).forEach((targets) => Object.keys(targets || {}).forEach((path) => inbound.set(path, (inbound.get(path) || 0) + 1)));
    const notes = await Promise.all(base.files.map(async (file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter || {};
      const tags = [];
      (cache?.tags || []).forEach((tag) => tags.push(tag.tag.replace(/^#/, "")));
      if (Array.isArray(frontmatter.tags)) tags.push(...frontmatter.tags.map(String));
      else if (typeof frontmatter.tags === "string") tags.push(frontmatter.tags);
      const content = await this.app.vault.cachedRead(file);
      const outgoing = Object.keys(resolved[file.path] || {}).length;
      const incoming = inbound.get(file.path) || 0;
      const signature = `${file.path} ${tags.join(" ")} ${content}`;
      return { file, cache, frontmatter, tags: [...new Set(tags)], content, signature, outgoing, incoming };
    }));
    const now = Date.now();
    const day = 86400000;
    const weekAdded = notes.filter((note) => note.file.stat.ctime >= now - 7 * day).length;
    const aiNotes = notes.filter((note) => /(AI|Agent|RAG|LLM|Claude|GPT|知识库|智能体)/i.test(note.signature));
    const health = Math.round(Math.max(0, Math.min(100, 100 - base.orphans / Math.max(1, notes.length) * 55 + Math.min(20, base.links / Math.max(1, notes.length) * 4))));
    const trend = [];
    for (let offset = 29; offset >= 0; offset -= 1) {
      const end = new Date(now - offset * day); end.setHours(23, 59, 59, 999);
      const files = notes.filter((note) => note.file.stat.ctime <= end.getTime());
      const links = files.reduce((sum, note) => sum + note.outgoing, 0);
      trend.push({ date: end, notes: files.length, links });
    }
    const categories = [
      ["AI 技术", "purple", /(AI|Agent|RAG|LLM|模型|智能体|知识库)/i],
      ["企业案例", "blue", /(企业|客户|案例|交付|FDE)/i],
      ["产品方案", "teal", /(产品|方案|项目|需求)/i],
      ["商业模式", "orange", /(商业|市场|销售|增长)/i],
      ["内容素材", "pink", /(内容|文章|公众号|短视频|素材)/i],
      ["学习资料", "green", /(学习|论文|课程|研究|资料)/i],
    ].map(([label, color, pattern]) => ({ label, color, count: notes.filter((note) => pattern.test(note.signature)).length }));
    const categoryTotal = Math.max(1, categories.reduce((sum, category) => sum + category.count, 0));
    categories.forEach((category) => { category.percent = Math.round(category.count / categoryTotal * 100); });
    const folders = new Map();
    notes.forEach((note) => {
      const folder = note.file.path.split("/")[0] || "根目录";
      folders.set(folder, (folders.get(folder) || 0) + 1);
    });
    const sources = [...folders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count], index) => ({ label, count, percent: Math.round(count / Math.max(1, notes.length) * 100), color: ["purple", "blue", "teal", "orange", "pink"][index] }));
    const tagCounts = new Map();
    notes.forEach((note) => note.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
    const tags = [...tagCounts.entries()].filter(([tag]) => !/(system|template|inbox|agent\/run)/i.test(tag)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const highValue = notes.filter((note) => !/(README|Templates|模板|system)/i.test(`${note.file.path} ${note.tags.join(" ")}`)).map((note) => {
      const projectReferences = Object.entries(resolved).filter(([source, targets]) => {
        if (!targets?.[note.file.path]) return false;
        const sourceFile = this.app.vault.getAbstractFileByPath(source);
        const sourceFrontmatter = sourceFile instanceof TFile ? this.app.metadataCache.getFileCache(sourceFile)?.frontmatter : null;
        return sourceFrontmatter?.type === "project" || /\/Projects\//i.test(source);
      }).length;
      const incomingLinks = note.incoming;
      const outgoingLinks = note.outgoing;
      const tagCount = note.tags.length;
      const contentLength = note.content.length;
      const finalScore = incomingLinks * 5 + outgoingLinks * 3 + tagCount * 2 + projectReferences * 4 + Math.min(10, Math.round(contentLength / 800));
      return {
        ...note,
        incomingLinks,
        outgoingLinks,
        tagCount,
        projectReferences,
        contentLength,
        finalScore,
        score: finalScore,
        value: Math.min(5, Math.max(1, Math.ceil(finalScore / 8))),
      };
    }).sort((a, b) => b.finalScore - a.finalScore || b.file.stat.mtime - a.file.stat.mtime).slice(0, 5);
    const heatmap = [];
    for (let offset = 34; offset >= 0; offset -= 1) {
      const start = new Date(now - offset * day); start.setHours(0, 0, 0, 0);
      const end = start.getTime() + day;
      heatmap.push(notes.filter((note) => note.file.stat.mtime >= start.getTime() && note.file.stat.mtime < end).length);
    }
    const gaps = [
      ["销售案例", /(销售案例|成交案例|销售复盘|采购决策)/i, "补充真实成交过程、决策链和异议处理。"],
      ["客户画像", /(客户画像|用户画像|ICP|理想客户)/i, "沉淀客户角色、痛点、预算与触发事件。"],
      ["行业数据", /(行业数据|市场规模|渗透率|行业报告)/i, "增加可引用的行业基准与数据来源。"],
    ].map(([label, pattern, suggestion]) => ({ label, suggestion, count: notes.filter((note) => pattern.test(note.signature)).length }));
    const agentRuns = notes.filter((note) => note.frontmatter.type === "agent-run" && note.file.path.startsWith(`${ROOT}/Agents/Runs/`));
    const runStatusCounts = new Map();
    agentRuns.forEach((run) => {
      const status = String(run.frontmatter.status || AGENT_RUN_STATUSES.DRAFT);
      runStatusCounts.set(status, (runStatusCounts.get(status) || 0) + 1);
    });
    const successfulRuns = runStatusCounts.get(AGENT_RUN_STATUSES.SUCCESS) || 0;
    const finishedDurations = agentRuns.map((run) => {
      const started = Date.parse(run.frontmatter.started_at || "");
      const finished = Date.parse(run.frontmatter.finished_at || "");
      return Number.isFinite(started) && Number.isFinite(finished) && finished >= started ? finished - started : null;
    }).filter((value) => value !== null);
    const agentMetrics = {
      total: agentRuns.length,
      success: successfulRuns,
      failed: runStatusCounts.get(AGENT_RUN_STATUSES.FAILED) || 0,
      blocked: runStatusCounts.get(AGENT_RUN_STATUSES.BLOCKED) || 0,
      waitingReview: runStatusCounts.get(AGENT_RUN_STATUSES.WAITING_REVIEW) || 0,
      successRate: agentRuns.length ? Math.round(successfulRuns / agentRuns.length * 100) : null,
      averageDuration: finishedDurations.length ? Math.round(finishedDurations.reduce((sum, value) => sum + value, 0) / finishedDurations.length / 1000) : null,
    };
    return { base, notes, weekAdded, aiNotes, health, trend, categories, sources, tags, highValue, heatmap, gaps, agentMetrics };
  }

  async render() {
    const version = ++this.renderVersion;
    const data = await this.getAnalyticsData();
    if (version !== this.renderVersion) return;
    const root = this.contentEl;
    root.empty();
    const app = root.createDiv({ cls: "akos-app akos-analytics-app" });
    this.renderAnalyticsSidebar(app, data);
    const center = app.createDiv({ cls: "akos-center akos-analytics-center" });
    this.renderAnalyticsTopbar(center, data);
    const scroll = center.createDiv({ cls: "akos-scroll akos-analytics-scroll" });
    this.renderAnalyticsHeader(scroll);
    this.renderAnalyticsStats(scroll, data);
    this.renderAnalyticsTop(scroll, data);
    this.renderAnalyticsBottom(scroll, data);
    this.renderStatus(center, data.base);
    this.renderAnalyticsAssistant(app, data);
  }

  renderAnalyticsSidebar(app, data) {
    super.renderSidebar(app, data.base);
    app.querySelectorAll(".akos-nav-item").forEach((button) => button.classList.toggle("is-active", button.querySelector(".akos-nav-title")?.textContent === "Analytics"));
  }

  renderAnalyticsTopbar(center, data) {
    const topbar = center.createDiv({ cls: "akos-topbar" });
    const searchWrap = topbar.createDiv({ cls: "akos-search akos-analytics-search" }); createIcon(searchWrap, "search");
    const input = searchWrap.createEl("input", { attr: { type: "search", placeholder: "搜索分析、趋势、标签、项目…", "aria-label": "搜索知识分析" } });
    input.addEventListener("keydown", (event) => event.key === "Enter" && input.value.trim() && this.runKnowledgeSearch(input.value.trim()));
    searchWrap.createSpan({ text: "⌘ K", cls: "akos-shortcut" });
    const actions = topbar.createDiv({ cls: "akos-top-actions" });
    createButton(actions, "AI 助手", "sparkles", "akos-top-action").addEventListener("click", () => this.focusPrompt());
    createButton(actions, "今日洞察", "clock-3", "akos-top-action").addEventListener("click", () => this.analyticsSummary(data));
    const bell = createButton(actions, "", "bell", "akos-icon-button"); bindPlannedFeature(bell, FEATURES.notificationCenter.label);
    const avatar = actions.createEl("button", { cls: "akos-avatar-button" }); avatar.createSpan({ text: (this.plugin.settings.userName || "E").charAt(0).toUpperCase(), cls: "akos-avatar" }); avatar.createSpan({ text: this.plugin.settings.userName || "Ethan" }); createIcon(avatar, "chevron-down");
    avatar.addEventListener("click", () => this.plugin.openSettings("analytics"));
  }

  renderAnalyticsHeader(parent) {
    const header = parent.createDiv({ cls: "akos-analytics-header" });
    const copy = header.createDiv(); copy.createEl("h1", { text: "Analytics" }); copy.createEl("p", { text: "洞察知识增长、结构分布、使用行为与 AI 执行效果。" });
    createButton(header, "分析视图设置", "settings", "akos-knowledge-settings").addEventListener("click", () => this.plugin.openSettings("analytics"));
  }

  renderAnalyticsStats(parent, data) {
    const cards = [
      ["本周新增知识", data.weekAdded, "真实创建时间", "layout-panel-top", "purple"],
      ["知识引用次数", data.base.links, "本地 Wikilink", "activity", "blue"],
      ["AI 主题知识", data.aiNotes.length, "AI / Agent / RAG", "bot", "teal"],
      ["知识系统健康度", `${data.health}%`, `${data.base.orphans} 篇孤立笔记`, "shield-check", "orange"],
    ];
    const grid = parent.createDiv({ cls: "akos-stat-grid akos-knowledge-stat-grid akos-analytics-stat-grid" });
    cards.forEach(([label, value, note, icon, color]) => {
      const card = grid.createDiv({ cls: "akos-stat-card" }); createIcon(card, icon, `akos-stat-icon is-${color}`);
      const copy = card.createDiv({ cls: "akos-stat-copy" }); copy.createDiv({ text: label, cls: "akos-stat-label" }); copy.createEl("strong", { text: String(value) }); copy.createDiv({ text: note, cls: "akos-stat-trend" });
    });
  }

  renderAnalyticsTop(parent, data) {
    const grid = parent.createDiv({ cls: "akos-analytics-top-grid" });
    const growth = grid.createDiv({ cls: "akos-panel akos-analytics-growth" });
    const head = growth.createDiv({ cls: "akos-analytics-panel-head" }); head.createEl("h2", { text: "知识增长趋势" });
    const legend = head.createDiv(); legend.createSpan({ text: "笔记数", cls: "is-purple" }); legend.createSpan({ text: "连接数", cls: "is-blue" }); head.createSpan({ text: "近 30 天", cls: "akos-analytics-period" });
    this.renderGrowthChart(growth, data.trend);
    const distribution = grid.createDiv({ cls: "akos-panel akos-analytics-distribution" });
    const distributionHead = distribution.createDiv({ cls: "akos-analytics-panel-head" }); distributionHead.createEl("h2", { text: "知识分布" });
    const donutWrap = distribution.createDiv({ cls: "akos-analytics-donut-wrap" });
    const cumulative = []; let total = 0; data.categories.forEach((category) => { cumulative.push(`${category.percent}%`); total += category.percent; });
    const colors = ["#8c61ff", "#4f91ff", "#24c2bb", "#f28b4b", "#e55eb5", "#49c874"];
    let start = 0; const stops = data.categories.map((category, index) => { const end = start + category.percent; const stop = `${colors[index]} ${start}% ${end}%`; start = end; return stop; }).join(", ");
    const donut = donutWrap.createDiv({ cls: "akos-analytics-donut", attr: { style: `background:conic-gradient(${stops || "#343a50 0 100%"})` } });
    const donutCenter = donut.createDiv(); donutCenter.createEl("strong", { text: formatNumber(data.notes.length) }); donutCenter.createSpan({ text: "总笔记数" });
    const categoryList = donutWrap.createDiv({ cls: "akos-analytics-category-list" });
    data.categories.forEach((category) => { const row = categoryList.createDiv(); row.createSpan({ cls: `is-${category.color}` }); row.createSpan({ text: category.label }); row.createEl("strong", { text: `${category.percent}%` }); });
    const tags = grid.createDiv({ cls: "akos-panel akos-analytics-tags-panel" });
    const tagHead = tags.createDiv({ cls: "akos-analytics-panel-head" }); tagHead.createEl("h2", { text: "标签活跃度 TOP10" });
    const maxTag = Math.max(1, data.tags[0]?.[1] || 1);
    data.tags.forEach(([tag, count], index) => { const row = tags.createDiv({ cls: "akos-analytics-tag-row" }); row.createSpan({ text: `#${tag}` }); const meter = row.createDiv(); meter.createSpan({ attr: { style: `width:${Math.max(8, count / maxTag * 100)}%` } }); row.createEl("strong", { text: String(count) }); row.toggleClass("is-blue", index > 5); });
  }

  renderGrowthChart(parent, trend) {
    const wrap = parent.createDiv({ cls: "akos-analytics-chart" });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 520 205"); svg.setAttribute("preserveAspectRatio", "none");
    [25, 65, 105, 145, 185].forEach((y) => { const line = document.createElementNS("http://www.w3.org/2000/svg", "line"); line.setAttribute("x1", "32"); line.setAttribute("x2", "508"); line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y)); line.setAttribute("class", "akos-analytics-gridline"); svg.appendChild(line); });
    const maxNotes = Math.max(1, ...trend.map((item) => item.notes)); const maxLinks = Math.max(1, ...trend.map((item) => item.links));
    const points = (key, max) => trend.map((item, index) => `${32 + index / Math.max(1, trend.length - 1) * 476},${185 - item[key] / max * 150}`).join(" ");
    [["notes", maxNotes, "is-purple"], ["links", maxLinks, "is-blue"]].forEach(([key, max, cls]) => { const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline"); polyline.setAttribute("points", points(key, max)); polyline.setAttribute("class", `akos-analytics-line ${cls}`); svg.appendChild(polyline); });
    wrap.appendChild(svg);
    const labels = wrap.createDiv({ cls: "akos-analytics-chart-labels" }); [29, 22, 15, 8, 0].forEach((offset) => { const date = trend[29 - offset]?.date || new Date(); labels.createSpan({ text: `${date.getMonth() + 1}/${date.getDate()}` }); });
  }

  renderAnalyticsBottom(parent, data) {
    const grid = parent.createDiv({ cls: "akos-analytics-bottom-grid" });
    const heat = grid.createDiv({ cls: "akos-panel akos-analytics-heat" });
    const heatHead = heat.createDiv({ cls: "akos-analytics-panel-head" }); heatHead.createEl("h2", { text: "知识使用热力图" });
    const heatBody = heat.createDiv({ cls: "akos-analytics-heatmap" });
    ["周一", "周二", "周三", "周四", "周五", "周六", "周日"].forEach((day) => heatBody.createSpan({ text: day, cls: "akos-analytics-day" }));
    const max = Math.max(1, ...data.heatmap); data.heatmap.forEach((value) => heatBody.createSpan({ cls: `akos-analytics-heat-cell is-${Math.ceil(value / max * 4)}`, attr: { title: `${value} 次更新` } }));
    const source = grid.createDiv({ cls: "akos-panel akos-analytics-sources" });
    const sourceHead = source.createDiv({ cls: "akos-analytics-panel-head" }); sourceHead.createEl("h2", { text: "知识来源占比" });
    data.sources.forEach((item) => { const row = source.createDiv({ cls: `akos-analytics-source-row is-${item.color}` }); createIcon(row, item.label === ROOT ? "notebook-tabs" : "folder"); row.createSpan({ text: item.label }); const meter = row.createDiv(); meter.createSpan({ attr: { style: `width:${item.percent}%` } }); row.createEl("strong", { text: `${item.percent}%` }); });
    const insights = grid.createDiv({ cls: "akos-panel akos-analytics-insights" });
    const insightHead = insights.createDiv({ cls: "akos-analytics-panel-head" }); insightHead.createEl("h2", { text: "AI 洞察与建议" });
    const topCategory = [...data.categories].sort((a, b) => b.count - a.count)[0];
    [["企业案例与商业模式存在连接缺口", `当前 ${topCategory?.label || "核心主题"} 占比最高，建议增加跨主题双链。`, "network", "purple"], ["知识增长保持活跃", `本周新增 ${data.weekAdded} 篇知识，健康度 ${data.health}%。`, "trending-up", "green"], ["建议补充结构性缺口", data.gaps.map((gap) => `${gap.label} ${gap.count} 篇`).join(" · "), "database", "blue"]].forEach(([title, note, icon, color]) => { const item = insights.createDiv({ cls: `akos-analytics-insight is-${color}` }); createIcon(item, icon); const copy = item.createDiv(); copy.createEl("strong", { text: title }); copy.createEl("p", { text: note }); });
    const ranking = grid.createDiv({ cls: "akos-panel akos-analytics-ranking" });
    const rankHead = ranking.createDiv({ cls: "akos-analytics-panel-head" }); rankHead.createEl("h2", { text: "高价值知识排行" });
    const tableHead = ranking.createDiv({ cls: "akos-analytics-rank-row is-head" }); ["#", "标题", "价值", "连接数", "更新时间"].forEach((label) => tableHead.createSpan({ text: label }));
    data.highValue.forEach((note, index) => { const row = ranking.createEl("button", { cls: "akos-analytics-rank-row" }); row.setAttr("title", `入链 ${note.incomingLinks} · 出链 ${note.outgoingLinks} · 标签 ${note.tagCount} · 项目引用 ${note.projectReferences} · 正文 ${note.contentLength} 字符 · 得分 ${note.finalScore}`); row.createSpan({ text: String(index + 1), cls: `is-rank-${index + 1}` }); row.createSpan({ text: note.file.basename }); row.createSpan({ text: "★".repeat(note.value) + "☆".repeat(5 - note.value), cls: "akos-analytics-stars" }); row.createSpan({ text: String(note.incoming + note.outgoing) }); row.createSpan({ text: formatRelativeTime(note.file.stat.mtime) }); row.addEventListener("click", () => this.openFile(note.file.path)); });
    const gaps = grid.createDiv({ cls: "akos-panel akos-analytics-gaps" });
    const gapsHead = gaps.createDiv({ cls: "akos-analytics-panel-head" }); gapsHead.createEl("h2", { text: "知识体系缺口" });
    data.gaps.forEach((gap) => { const item = gaps.createDiv({ cls: "akos-analytics-gap" }); createIcon(item, gap.count < 3 ? "triangle-alert" : "circle-check"); const copy = item.createDiv(); copy.createEl("strong", { text: gap.label }); copy.createSpan({ text: gap.count < 3 ? gap.suggestion : `已有 ${gap.count} 篇，继续连接到项目。` }); item.createEl("b", { text: `${gap.count} 篇` }); });
  }

  renderAnalyticsAssistant(app, data) {
    const aside = app.createEl("aside", { cls: "akos-copilot akos-analytics-assistant" }); app.toggleClass("is-copilot-collapsed", this.copilotCollapsed); aside.toggleClass("is-collapsed", this.copilotCollapsed);
    const header = aside.createDiv({ cls: "akos-copilot-header" }); const title = header.createDiv({ cls: "akos-copilot-title" }); createIcon(title, "sparkles"); title.createEl("strong", { text: "AI 助手" });
    const toggle = createButton(header, "", this.copilotCollapsed ? "panel-left-open" : "panel-right-close", "akos-icon-button akos-assistant-toggle"); toggle.setAttr("aria-label", this.copilotCollapsed ? "展开 AI 助手" : "收起 AI 助手"); toggle.addEventListener("click", () => { this.copilotCollapsed = !this.copilotCollapsed; void this.render(); });
    const scroll = aside.createDiv({ cls: "akos-copilot-scroll akos-analytics-assistant-scroll" });
    const intro = scroll.createDiv({ cls: "akos-copilot-intro" }); intro.createEl("h2", { text: `你好，${this.plugin.settings.userName || "Ethan"} 👋` }); intro.createEl("p", { text: "我是你的 AI 知识分析助手，帮你洞察数据、发现问题、优化知识体系。" });
    const actions = scroll.createDiv({ cls: "akos-analytics-ai-actions" });
    [["总结本周知识表现", "calendar-plus", () => this.analyticsSummary(data)], ["分析高价值知识", "sparkles", () => this.highValueSummary(data)], ["发现结构缺口", "clipboard-check", () => this.gapSummary(data)], ["生成知识周报", "notebook-tabs", () => this.generateAnalyticsReport(data)], ["追踪 AI 执行效果", "orbit", () => this.executionSummary(data)]].forEach(([label, icon, action]) => createButton(actions, label, icon, "akos-analytics-ai-action").addEventListener("click", action));
    const overview = scroll.createDiv({ cls: "akos-analytics-ai-overview" }); overview.createEl("h3", { text: "当前分析概览" });
    const metrics = overview.createDiv(); [["笔记数", data.notes.length, "notebook-tabs", "blue"], ["链接数", data.base.links, "link", "green"], ["活跃标签", data.tags.length, "tag", "orange"], ["项目数", data.notes.filter((note) => note.frontmatter.type === "project").length, "folder-kanban", "cyan"]].forEach(([label, value, icon, color]) => { const item = metrics.createDiv(); createIcon(item, icon, `is-${color}`); item.createEl("strong", { text: formatNumber(value) }); item.createSpan({ text: label }); });
    const hot = overview.createDiv({ cls: "akos-analytics-hot-tags" }); data.tags.slice(0, 8).forEach(([tag]) => hot.createSpan({ text: `#${tag}` }));
    if (this.analyticsAiResponse) { const response = scroll.createDiv({ cls: "akos-ai-response is-visible" }); response.createEl("strong", { text: this.analyticsAiResponse.title }); response.createEl("p", { text: this.analyticsAiResponse.text }); }
    const composer = aside.createDiv({ cls: "akos-composer akos-analytics-composer" });
    const input = composer.createEl("textarea", { cls: "akos-prompt", attr: { placeholder: "Ask your analytics…", "aria-label": "询问知识分析助手" } });
    const actionRow = composer.createDiv({ cls: "akos-composer-actions" });
    createPlannedIconButton(actionRow, "paperclip", "assistantAttachment");
    createPlannedIconButton(actionRow, "smile", "emojiPicker");
    createPlannedIconButton(actionRow, "at-sign", "assistantMention");
    createButton(actionRow, "", "send-horizontal", "akos-send").addEventListener("click", () => input.value.trim() && this.openClaudian(input.value.trim()));
    composer.createDiv({ text: "基于你的本地知识库生成，内容仅供参考", cls: "akos-composer-note" });
  }

  analyticsSummary(data) { this.analyticsAiResponse = { title: "本周知识表现", text: `本周新增 ${data.weekAdded} 篇，当前共 ${data.notes.length} 篇笔记、${data.base.links} 条连接，知识健康度 ${data.health}%。` }; void this.render(); }
  highValueSummary(data) { const note = data.highValue[0]; this.analyticsAiResponse = { title: "高价值知识", text: note ? `当前价值最高的是“${note.file.basename}”，共有 ${note.incoming + note.outgoing} 条直接连接。` : "当前还没有足够数据进行价值排序。" }; void this.render(); }
  gapSummary(data) { this.analyticsAiResponse = { title: "知识结构缺口", text: data.gaps.map((gap) => `${gap.label}：${gap.count} 篇`).join("；") + "。优先补充数量最少且能连接真实项目的主题。" }; void this.render(); }
  executionSummary(data) {
    const metrics = data.agentMetrics;
    this.analyticsAiResponse = {
      title: "AI 执行效果",
      text: metrics.total
        ? `真实任务 ${metrics.total} 个：成功 ${metrics.success}、失败 ${metrics.failed}、阻塞 ${metrics.blocked}、待验收 ${metrics.waitingReview}。成功率 ${metrics.successRate}%，${metrics.averageDuration === null ? "暂无完整耗时数据" : `平均耗时 ${metrics.averageDuration} 秒`}。`
        : "当前还没有真实 Agent 运行记录，未生成模拟成功率。",
    };
    void this.render();
  }

  async generateAnalyticsReport(data) {
    const date = new Date().toISOString().slice(0, 10);
    const path = await this.uniquePath(`${ROOT}/Analytics/${date}-知识分析周报.md`);
    const rankings = data.highValue.map((note, index) => `${index + 1}. [[${note.file.path.replace(/\.md$/, "")}]] — ${note.incoming + note.outgoing} 条连接`).join("\n");
    const gaps = data.gaps.map((gap) => `- ${gap.label}：${gap.count} 篇。${gap.suggestion}`).join("\n");
    const content = `---\ntitle: "${date} 知识分析周报"\ntype: report\ncreated: ${new Date().toISOString()}\ntags:\n  - report/analytics\n---\n\n# ${date} 知识分析周报\n\n## 核心指标\n\n- 本周新增：${data.weekAdded}\n- 总笔记：${data.notes.length}\n- 总连接：${data.base.links}\n- 健康度：${data.health}%\n\n## 高价值知识\n\n${rankings || "暂无"}\n\n## 知识缺口\n\n${gaps}\n`;
    const file = await this.app.vault.create(path, content); await this.app.workspace.getLeaf("tab").openFile(file); new Notice("知识分析周报已生成");
  }
}

module.exports = class AIKnowledgeOSPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.isUnloading = false;
    this.runtimeInitialized = false;
    this.startupTimer = null;
    this.router = new KnowledgeOSRouter(this);
    this.agentTaskStore = new AgentTaskStore(this);
    this.claudianAdapter = new ClaudianAdapter(this);
    this.lastFile = this.app.workspace.getActiveFile();
    this.registerView(VIEW_TYPE, (leaf) => new KnowledgeDashboardView(leaf, this));
    this.registerView(INBOX_VIEW_TYPE, (leaf) => new InboxView(leaf, this));
    this.registerView(KNOWLEDGE_VIEW_TYPE, (leaf) => new KnowledgeCenterView(leaf, this));
    this.registerView(GRAPH_VIEW_TYPE, (leaf) => new KnowledgeGraphView(leaf, this));
    this.registerView(PROJECT_VIEW_TYPE, (leaf) => new ProjectCenterView(leaf, this));
    this.registerView(AGENT_VIEW_TYPE, (leaf) => new AgentCenterView(leaf, this));
    this.registerView(ANALYTICS_VIEW_TYPE, (leaf) => new KnowledgeAnalyticsView(leaf, this));
    this.addRibbonIcon("brain-circuit", "打开 AI Knowledge OS", () => this.activateView());
    this.addCommand({
      id: "open-dashboard",
      name: "打开知识驾驶舱",
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "new-inbox-note",
      name: "新建 Inbox 笔记",
      callback: async () => {
        await this.activateInbox();
        this.getInbox()?.createQuickNote();
      },
    });
    this.addCommand({
      id: "open-inbox",
      name: "打开 Inbox 信息收集箱",
      callback: () => this.activateInbox(),
    });
    this.addCommand({
      id: "open-knowledge-center",
      name: "打开 Knowledge Center",
      callback: () => this.activateKnowledge(),
    });
    this.addCommand({
      id: "open-knowledge-map",
      name: "打开知识地图",
      callback: () => this.activateGraph(),
    });
    this.addCommand({
      id: "open-project-center",
      name: "打开项目中心",
      callback: () => this.activateProjects(),
    });
    this.addCommand({
      id: "open-agent-center",
      name: "打开智能体中心",
      callback: () => this.activateAgents(),
    });
    this.addCommand({
      id: "open-knowledge-analytics",
      name: "打开知识分析",
      callback: () => this.activateAnalytics(),
    });
    this.addCommand({
      id: "approve-active-agent-run",
      name: "验收当前 Agent 运行结果",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || this.app.metadataCache.getFileCache(file)?.frontmatter?.type !== "agent-run") {
          new Notice("当前文件不是 Agent 运行记录");
          return;
        }
        try {
          await this.agentTaskStore.approve(file);
          new Notice("Agent 输出已验收通过");
        } catch (error) {
          new Notice(error instanceof Error ? error.message : String(error));
        }
      },
    });
    this.addSettingTab(new AIKnowledgeOSSettingTab(this.app, this));

    this.register(() => {
      if (this.startupTimer !== null) window.clearTimeout(this.startupTimer);
      this.startupTimer = null;
    });

    this.app.workspace.onLayoutReady(() => {
      if (!this.isUnloading) void this.initializeRuntime();
    });
  }

  async initializeRuntime() {
    if (this.runtimeInitialized || this.isUnloading) return;
    this.runtimeInitialized = true;

    const refresh = debounce(() => this.refreshDashboard(), 500);
    this.registerEvent(this.app.vault.on("create", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("modify", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.registerEvent(this.app.metadataCache.on("resolved", refresh));
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file) this.lastFile = file;
    }));

    try {
      await this.agentTaskStore.ensureDefinitions();
    } catch (error) {
      console.error("AI Knowledge OS: failed to initialize Agent definitions", error);
      new Notice("AI Knowledge OS 的 Agent 目录初始化失败，其他页面仍可正常使用");
    }

    if (this.settings.openOnStartup && !this.isUnloading) {
      this.startupTimer = window.setTimeout(() => {
        this.startupTimer = null;
        if (this.isUnloading) return;
        void this.activateView().catch((error) => {
          console.error("AI Knowledge OS: failed to open Dashboard on startup", error);
        });
      }, 250);
    }
  }

  onunload() {
    this.isUnloading = true;
    if (this.startupTimer !== null) window.clearTimeout(this.startupTimer);
    this.startupTimer = null;
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(INBOX_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(KNOWLEDGE_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(GRAPH_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(PROJECT_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(AGENT_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(ANALYTICS_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getDashboard() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view || null;
  }

  getInbox() {
    return this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)[0]?.view || null;
  }

  getKnowledgeCenter() {
    return this.app.workspace.getLeavesOfType(KNOWLEDGE_VIEW_TYPE)[0]?.view || null;
  }

  getGraph() {
    return this.app.workspace.getLeavesOfType(GRAPH_VIEW_TYPE)[0]?.view || null;
  }

  getProjects() {
    return this.app.workspace.getLeavesOfType(PROJECT_VIEW_TYPE)[0]?.view || null;
  }

  getAgents() {
    return this.app.workspace.getLeavesOfType(AGENT_VIEW_TYPE)[0]?.view || null;
  }

  getAnalytics() {
    return this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE)[0]?.view || null;
  }

  refreshDashboard() {
    const dashboard = this.getDashboard();
    if (dashboard && typeof dashboard.render === "function") dashboard.refresh();
    const inbox = this.getInbox();
    if (inbox && typeof inbox.render === "function") inbox.refresh();
    const knowledge = this.getKnowledgeCenter();
    if (knowledge && typeof knowledge.render === "function") knowledge.refresh();
    const graph = this.getGraph();
    if (graph && typeof graph.render === "function") graph.refresh();
    const projects = this.getProjects();
    if (projects && typeof projects.render === "function") projects.refresh();
    const agents = this.getAgents();
    if (agents && typeof agents.render === "function") agents.refresh();
    const analytics = this.getAnalytics();
    if (analytics && typeof analytics.render === "function") analytics.refresh();
  }

  async revealKnowledgeLeaf(leaf) {
    await this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf?.(leaf, { focus: true });
    await wait(25);
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await this.revealKnowledgeLeaf(leaf);
    if (this.settings.immersiveMode) {
      this.app.workspace.leftSplit?.collapse();
      this.app.workspace.rightSplit?.collapse();
    }
  }

  async activateInbox() {
    let leaf = this.app.workspace.getLeavesOfType(INBOX_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: INBOX_VIEW_TYPE, active: true });
    }
    await this.revealKnowledgeLeaf(leaf);
    if (this.settings.immersiveMode) {
      this.app.workspace.leftSplit?.collapse();
      this.app.workspace.rightSplit?.collapse();
    }
  }

  async activateKnowledge() {
    let leaf = this.app.workspace.getLeavesOfType(KNOWLEDGE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: KNOWLEDGE_VIEW_TYPE, active: true });
    }
    await this.revealKnowledgeLeaf(leaf);
    if (this.settings.immersiveMode) {
      this.app.workspace.leftSplit?.collapse();
      this.app.workspace.rightSplit?.collapse();
    }
  }

  async activateGraph() {
    let leaf = this.app.workspace.getLeavesOfType(GRAPH_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: GRAPH_VIEW_TYPE, active: true });
    }
    await this.revealKnowledgeLeaf(leaf);
    if (this.settings.immersiveMode) {
      this.app.workspace.leftSplit?.collapse();
      this.app.workspace.rightSplit?.collapse();
    }
  }

  async activateProjects() {
    let leaf = this.app.workspace.getLeavesOfType(PROJECT_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: PROJECT_VIEW_TYPE, active: true });
    }
    await this.revealKnowledgeLeaf(leaf);
    if (this.settings.immersiveMode) {
      this.app.workspace.leftSplit?.collapse();
      this.app.workspace.rightSplit?.collapse();
    }
  }

  async activateAgents() {
    let leaf = this.app.workspace.getLeavesOfType(AGENT_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: AGENT_VIEW_TYPE, active: true });
    }
    await this.revealKnowledgeLeaf(leaf);
    if (this.settings.immersiveMode) {
      this.app.workspace.leftSplit?.collapse();
      this.app.workspace.rightSplit?.collapse();
    }
  }

  async activateAnalytics() {
    let leaf = this.app.workspace.getLeavesOfType(ANALYTICS_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: ANALYTICS_VIEW_TYPE, active: true });
    }
    await this.revealKnowledgeLeaf(leaf);
    if (this.settings.immersiveMode) {
      this.app.workspace.leftSplit?.collapse();
      this.app.workspace.rightSplit?.collapse();
    }
  }

  async updateGraphSnapshot(currentEdges) {
    const date = new Date().toISOString().slice(0, 10);
    const current = [...new Set(currentEdges)].sort();
    const snapshot = this.settings.graphSnapshot;
    if (!snapshot || snapshot.date !== date) {
      this.settings.graphSnapshot = {
        date,
        baselineEdges: snapshot?.currentEdges || current,
        currentEdges: current,
      };
      await this.saveSettings();
      const baseline = new Set(this.settings.graphSnapshot.baselineEdges);
      return current.filter((edge) => !baseline.has(edge)).length;
    }
    const baseline = new Set(snapshot.baselineEdges || []);
    const added = current.filter((edge) => !baseline.has(edge)).length;
    if (JSON.stringify(snapshot.currentEdges || []) !== JSON.stringify(current)) {
      snapshot.currentEdges = current;
      await this.saveSettings();
    }
    return added;
  }

  async executeAgent(agent, prompt, sources = []) {
    const task = await this.agentTaskStore.createRun(agent, prompt, sources);
    new Notice(`${agent.name} 已进入执行队列`);
    const capability = this.claudianAdapter.detect();
    if (!capability.compatible) {
      const error = capability.available
        ? `Claudian ${capability.version || "未知版本"} 当前暂未适配`
        : "Claudian 未安装或未启用";
      await this.agentTaskStore.transition(task, AGENT_RUN_STATUSES.BLOCKED, {
        provider_version: capability.version || "",
        error,
        finished_at: new Date().toISOString(),
      });
      new Notice(error);
      this.refreshDashboard();
      return task;
    }
    await this.agentTaskStore.transition(task, AGENT_RUN_STATUSES.RUNNING, {
      provider_version: capability.version,
      started_at: new Date().toISOString(),
      error: "",
    });
    this.refreshDashboard();
    try {
      const result = await this.claudianAdapter.execute(task);
      if (!result.content?.trim()) throw new Error("Claudian 返回了空内容");
      const outputFile = await this.agentTaskStore.saveOutput(task, result);
      await this.agentTaskStore.transition(task, AGENT_RUN_STATUSES.WAITING_REVIEW, {
        finished_at: new Date().toISOString(),
        conversation_id: result.conversationId || "",
        output_file: outputFile.path,
        reviewed: false,
        error: "",
      });
      await this.app.workspace.getLeaf("tab").openFile(outputFile);
      new Notice(`${agent.name} 已完成，等待人工验收`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextStatus = /未安装|未启用|暂未适配|不可用/.test(message)
        ? AGENT_RUN_STATUSES.BLOCKED
        : /已取消/.test(message)
          ? AGENT_RUN_STATUSES.CANCELLED
          : AGENT_RUN_STATUSES.FAILED;
      await this.agentTaskStore.transition(task, nextStatus, {
        finished_at: new Date().toISOString(),
        error: message,
      });
      new Notice(`${agent.name} 执行未完成：${message}`);
    } finally {
      this.refreshDashboard();
    }
    return task;
  }

  async runClaudianPrompt(prompt) {
    const agent = {
      id: "assistant",
      name: "Knowledge OS 助手",
      description: "基于当前本地知识上下文完成用户提交的深度任务。",
      output: "分析结果",
    };
    const active = this.app.workspace.getActiveFile();
    void this.executeAgent(agent, prompt, active ? [active] : []);
    return true;
  }

  openSettings(section) {
    this.app.setting?.open();
    this.app.setting?.openTabById(this.manifest.id);
    if (section) window.setTimeout(() => {
      document.querySelector(`#akos-settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }
};
