import {
  Notice,
  Plugin,
  TFile,
  TextFileView,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { ParsedXml, WarningItem, XmlAttributeNode, XmlTreeNode, parseXml } from "./parser";

const VIEW_TYPE_XML_VIEWER = "xml-viewer";
const XML_EXTENSIONS = ["xml"];

type ViewMode = "tree" | "source";

export default class XmlViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_XML_VIEWER,
      (leaf) => new XmlViewerView(leaf),
    );
    this.registerExtensions(XML_EXTENSIONS, VIEW_TYPE_XML_VIEWER);

    this.addCommand({
      id: "open-current-xml-in-viewer",
      name: "Open current XML file in viewer",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isXmlFile(file)) return false;

        if (!checking) {
          void this.openXmlFile(file);
        }
        return true;
      },
    });
  }

  async openXmlFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_XML_VIEWER,
      state: { file: file.path },
      active: true,
    });
  }
}

class XmlViewerView extends TextFileView {
  private mode: ViewMode = "tree";
  private filterValue = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_XML_VIEWER;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "XML viewer";
  }

  getIcon(): string {
    return "file-code-2";
  }

  setViewData(data: string): void {
    this.data = data;
    this.render();
  }

  getViewData(): string {
    return this.data;
  }

  clear(): void {
    this.data = "";
    this.contentEl.empty();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("xml-viewer");

    const header = container.createDiv({ cls: "xml-viewer__header" });
    this.renderTitle(header);
    this.renderToolbar(header);

    if (!this.file) {
      renderMessage(container, "No XML file is attached to this viewer.");
      return;
    }

    if (!isXmlFile(this.file)) {
      renderMessage(container, "This viewer only supports .xml files.");
      return;
    }

    const parsed = parseXml(this.data);
    renderSummary(container, parsed);
    renderWarnings(container, parsed.warnings);

    if (!this.data.trim()) {
      renderMessage(container, "This file is empty.");
      return;
    }

    if (this.mode === "source" || parsed.isMalformed || !parsed.root) {
      renderSource(container, this.data);
      return;
    }

    renderTree(container, parsed, this.filterValue);
  }

  private renderTitle(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: "xml-viewer__title" });
    title.createDiv({
      cls: "xml-viewer__filename",
      text: this.file?.name ?? "XML file",
    });
    title.createDiv({
      cls: "xml-viewer__path",
      text: this.file?.path ?? "",
    });
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "xml-viewer__toolbar" });

    const searchWrap = toolbar.createDiv({ cls: "xml-viewer__search" });
    setIcon(searchWrap.createSpan({ cls: "xml-viewer__search-icon" }), "search");
    const searchInput = searchWrap.createEl("input", {
      attr: {
        "aria-label": "Filter XML nodes",
        placeholder: "Filter",
        spellcheck: "false",
        type: "search",
        value: this.filterValue,
      },
    });
    searchInput.addEventListener("input", () => {
      this.filterValue = searchInput.value;
      this.render();
    });

    const modeGroup = toolbar.createDiv({
      cls: "xml-viewer__segmented",
      attr: { "aria-label": "View mode" },
    });
    const treeButton = createTextButton(modeGroup, "Tree");
    const sourceButton = createTextButton(modeGroup, "Source");
    treeButton.toggleClass("is-active", this.mode === "tree");
    sourceButton.toggleClass("is-active", this.mode === "source");

    treeButton.addEventListener("click", () => {
      this.mode = "tree";
      this.render();
    });
    sourceButton.addEventListener("click", () => {
      this.mode = "source";
      this.render();
    });

    const refreshButton = createIconButton(toolbar, "refresh-cw", "Refresh file");
    refreshButton.addEventListener("click", () => {
      void this.reloadFile();
    });
  }

  private async reloadFile(): Promise<void> {
    if (!this.file) {
      new Notice("No XML file to refresh");
      return;
    }

    try {
      this.data = await this.app.vault.read(this.file);
      this.render();
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.addClass("xml-viewer");
      renderMessage(this.contentEl, `Unable to read file: ${getErrorMessage(error)}`);
    }
  }
}

function renderSummary(parent: HTMLElement, parsed: ParsedXml): void {
  const summary = parent.createDiv({ cls: "xml-viewer__summary" });
  summary.createSpan({
    cls: "xml-viewer__pill",
    text: `${parsed.nodeCount} nodes`,
  });
  summary.createSpan({
    cls: "xml-viewer__pill",
    text: `${parsed.renderedNodeCount} rendered`,
  });
  summary.createSpan({
    cls: `xml-viewer__pill ${parsed.isMalformed ? "xml-viewer__pill--error" : ""}`,
    text: parsed.isMalformed ? "parse error" : "well-formed",
  });
  if (parsed.skippedNodes > 0) {
    summary.createSpan({
      cls: "xml-viewer__note",
      text: `${parsed.skippedNodes} nodes hidden by render cap`,
    });
  }
}

function renderWarnings(parent: HTMLElement, warnings: WarningItem[]): void {
  if (warnings.length === 0) return;

  const box = parent.createDiv({ cls: "xml-viewer__warnings" });
  box.createDiv({ cls: "xml-viewer__warnings-title", text: "Parse warnings" });
  warnings.slice(0, 12).forEach((warning) => {
    box.createDiv({
      cls: "xml-viewer__warning",
      text: `${warning.label}: ${warning.message}`,
    });
  });
  if (warnings.length > 12) {
    box.createDiv({
      cls: "xml-viewer__warning-more",
      text: `${warnings.length - 12} additional warnings hidden`,
    });
  }
}

function renderTree(parent: HTMLElement, parsed: ParsedXml, query: string): void {
  if (!parsed.root) {
    renderMessage(parent, "No XML nodes to display.");
    return;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const body = parent.createDiv({ cls: "xml-viewer__body" });
  const main = body.createDiv({ cls: "xml-viewer__main" });
  const tree = main.createDiv({ cls: "xml-viewer__tree" });

  const rendered = renderNode(tree, parsed.root, normalizedQuery, true);
  if (!rendered) {
    renderMessage(tree, "No XML nodes match the current filter.");
  }

  renderOutline(body, parsed.root);
}

function renderNode(
  parent: HTMLElement,
  node: XmlTreeNode,
  query: string,
  forceVisible = false,
): boolean {
  const childMatches = node.children
    .map((child) => ({ child, matches: nodeMatches(child, query) }))
    .filter(({ matches }) => !query || matches);
  const ownMatch = !query || node.searchText.includes(query);
  const visible = forceVisible || ownMatch || childMatches.length > 0;
  if (!visible) return false;

  if (node.children.length > 0) {
    const details = parent.createEl("details", {
      cls: `xml-viewer__branch xml-viewer__type-${cssKind(node.kind)}`,
    });
    details.open = node.depth < 3 || Boolean(query);
    const summary = details.createEl("summary", { cls: "xml-viewer__row" });
    renderNodeHeader(summary, node);
    renderAttributes(details, node.attributes);
    if (node.textPreview) {
      details.createDiv({ cls: "xml-viewer__preview", text: node.textPreview });
    }

    const children = details.createDiv({ cls: "xml-viewer__children" });
    const candidates = query ? childMatches.map(({ child }) => child) : node.children;
    candidates.forEach((child) => {
      renderNode(children, child, query);
    });
    return true;
  }

  const row = parent.createDiv({
    cls: `xml-viewer__row xml-viewer__leaf xml-viewer__type-${cssKind(node.kind)}`,
  });
  renderNodeHeader(row, node);
  renderAttributes(row, node.attributes);
  if (node.value || node.textPreview) {
    row.createSpan({ cls: "xml-viewer__value", text: node.value || node.textPreview });
  }
  return true;
}

function nodeMatches(node: XmlTreeNode, query: string): boolean {
  if (!query || node.searchText.includes(query)) return true;
  return node.children.some((child) => nodeMatches(child, query));
}

function renderNodeHeader(parent: HTMLElement, node: XmlTreeNode): void {
  parent.createSpan({ cls: "xml-viewer__key", text: node.name });
  parent.createSpan({ cls: "xml-viewer__badge", text: node.kind });
  const metaParts = [
    node.attributeCount > 0 ? `${node.attributeCount} attrs` : "",
    node.childCount > 0 ? `${node.childCount} children` : "",
  ].filter(Boolean);
  if (metaParts.length > 0) {
    parent.createSpan({ cls: "xml-viewer__meta", text: metaParts.join(" · ") });
  }
  parent.createSpan({ cls: "xml-viewer__path-chip", text: node.path });
}

function renderAttributes(parent: HTMLElement, attributes: XmlAttributeNode[]): void {
  if (attributes.length === 0) return;

  const list = parent.createDiv({ cls: "xml-viewer__attrs" });
  attributes.forEach((attribute) => {
    const item = list.createDiv({ cls: "xml-viewer__attr" });
    item.createSpan({ cls: "xml-viewer__attr-name", text: attribute.name });
    item.createSpan({ cls: "xml-viewer__attr-equals", text: "=" });
    item.createSpan({ cls: "xml-viewer__attr-value", text: `"${attribute.value}"` });
  });
}

function renderOutline(parent: HTMLElement, root: XmlTreeNode): void {
  const outline = parent.createDiv({ cls: "xml-viewer__outline" });
  outline.createDiv({ cls: "xml-viewer__outline-title", text: "Outline" });
  const elementNodes = root.children.filter((child) => child.kind === "element").slice(0, 80);
  if (elementNodes.length === 0) {
    outline.createDiv({ cls: "xml-viewer__outline-empty", text: "No top-level elements" });
    return;
  }

  elementNodes.forEach((node) => {
    const item = outline.createDiv({ cls: "xml-viewer__outline-item" });
    item.createSpan({ cls: "xml-viewer__outline-label", text: node.name });
    item.createSpan({ cls: "xml-viewer__outline-meta", text: node.path });
  });
}

function renderSource(parent: HTMLElement, data: string): void {
  const source = parent.createDiv({ cls: "xml-viewer__source" });
  const pre = source.createEl("pre");
  data.split("\n").forEach((line, index) => {
    const lineEl = pre.createDiv({ cls: "xml-viewer__source-line" });
    lineEl.createSpan({ cls: "xml-viewer__line-number", text: String(index + 1) });
    const code = lineEl.createSpan({ cls: "xml-viewer__source-code" });
    highlightXmlLine(code, line);
  });
}

function highlightXmlLine(parent: HTMLElement, line: string): void {
  const tokenPattern = /(<!--.*?-->|<!\[CDATA\[.*?\]\]>|<\/?[A-Za-z_][\w:.-]*|[A-Za-z_:][\w:.-]*(?=\=)|"[^"]*"|'[^']*'|[<>/=])/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(line)) !== null) {
    if (match.index > cursor) {
      parent.createSpan({ text: line.slice(cursor, match.index) });
    }

    const token = match[0];
    parent.createSpan({ cls: tokenClass(token), text: token });
    cursor = match.index + token.length;
  }

  if (cursor < line.length) {
    parent.createSpan({ text: line.slice(cursor) });
  }
}

function tokenClass(token: string): string {
  if (token.startsWith("<!--")) return "xml-viewer__tok-comment";
  if (token.startsWith("<![CDATA[")) return "xml-viewer__tok-cdata";
  if (token.startsWith("<")) return "xml-viewer__tok-tag";
  if (token.startsWith("\"") || token.startsWith("'")) return "xml-viewer__tok-string";
  if (["<", ">", "/", "="].includes(token)) return "xml-viewer__tok-punctuation";
  return "xml-viewer__tok-attr";
}

function cssKind(kind: string): string {
  return kind.replace(/[^a-z0-9]+/g, "-");
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon xml-viewer__button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

function createTextButton(parent: HTMLElement, label: string): HTMLButtonElement {
  return parent.createEl("button", {
    cls: "xml-viewer__text-button",
    text: label,
    attr: { type: "button" },
  });
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "xml-viewer__message", text: message });
}

function isXmlFile(file: TFile | null): file is TFile {
  return Boolean(file && XML_EXTENSIONS.includes(file.extension.toLowerCase()));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
