export const RENDER_NODE_LIMIT = 10000;

export type XmlNodeKind =
  | "document"
  | "element"
  | "attribute"
  | "text"
  | "comment"
  | "cdata"
  | "processing-instruction"
  | "doctype";

export interface WarningItem {
  label: string;
  message: string;
}

export interface XmlAttributeNode {
  kind: "attribute";
  name: string;
  value: string;
  path: string;
  searchText: string;
}

export interface XmlTreeNode {
  kind: XmlNodeKind;
  name: string;
  value: string;
  path: string;
  depth: number;
  attributes: XmlAttributeNode[];
  children: XmlTreeNode[];
  childCount: number;
  attributeCount: number;
  textPreview: string;
  searchText: string;
  truncated?: boolean;
}

export interface ParsedXml {
  root: XmlTreeNode | null;
  warnings: WarningItem[];
  nodeCount: number;
  renderedNodeCount: number;
  skippedNodes: number;
  isMalformed: boolean;
}

export interface XmlParserLike {
  parseFromString(data: string, mimeType: DOMParserSupportedType): Document;
}

export function parseXml(
  data: string,
  parser: XmlParserLike = new DOMParser(),
  nodeLimit = RENDER_NODE_LIMIT,
): ParsedXml {
  const warnings: WarningItem[] = [];

  if (!data.trim()) {
    return {
      root: null,
      warnings,
      nodeCount: 0,
      renderedNodeCount: 0,
      skippedNodes: 0,
      isMalformed: false,
    };
  }

  let document: Document;
  try {
    document = parser.parseFromString(data, "application/xml");
  } catch (error) {
    return malformedResult(`Unable to parse XML: ${getErrorMessage(error)}`);
  }

  const parserError = findParserError(document);
  if (parserError) {
    return malformedResult(parserError);
  }

  const counter = { total: 0, rendered: 0, skipped: 0 };
  const root = normalizeDocument(document, nodeLimit, counter);

  if (counter.skipped > 0) {
    warnings.push({
      label: "Render cap",
      message: `${counter.skipped} nodes are not rendered to keep the view responsive.`,
    });
  }

  return {
    root,
    warnings,
    nodeCount: counter.total,
    renderedNodeCount: counter.rendered,
    skippedNodes: counter.skipped,
    isMalformed: false,
  };
}

function malformedResult(message: string): ParsedXml {
  return {
    root: null,
    warnings: [{ label: "Parse error", message }],
    nodeCount: 0,
    renderedNodeCount: 0,
    skippedNodes: 0,
    isMalformed: true,
  };
}

function normalizeDocument(document: Document, limit: number, counter: Counter): XmlTreeNode {
  const root = createTreeNode({
    kind: "document",
    name: "#document",
    value: "",
    path: "/",
    depth: 0,
    attributes: [],
  });

  root.children = normalizeChildren(document.childNodes, "/", 1, limit, counter);
  root.childCount = root.children.length;
  root.textPreview = textPreview(root.children.map((child) => child.textPreview).join(" "));
  root.searchText = searchTextFor(root);
  root.truncated = counter.skipped > 0;
  return root;
}

function normalizeChildren(
  nodes: NodeListOf<ChildNode>,
  parentPath: string,
  depth: number,
  limit: number,
  counter: Counter,
): XmlTreeNode[] {
  const children: XmlTreeNode[] = [];
  const nameCounts = new Map<string, number>();

  Array.from(nodes).forEach((node) => {
    counter.total += 1;

    if (!isRenderableNode(node)) return;

    if (counter.rendered >= limit) {
      counter.skipped += 1;
      return;
    }

    counter.rendered += 1;
    const normalized = normalizeNode(node, parentPath, depth, limit, counter, nameCounts);
    if (!normalized) {
      counter.rendered -= 1;
      return;
    }

    children.push(normalized);
  });

  return children;
}

function isRenderableNode(node: ChildNode): boolean {
  return node.nodeType !== Node.TEXT_NODE || Boolean((node.nodeValue ?? "").trim());
}

function normalizeNode(
  node: ChildNode,
  parentPath: string,
  depth: number,
  limit: number,
  counter: Counter,
  nameCounts: Map<string, number>,
): XmlTreeNode | null {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      return normalizeElement(node as Element, parentPath, depth, limit, counter, nameCounts);
    case Node.TEXT_NODE:
      return normalizeText(node, parentPath, depth, nameCounts);
    case Node.COMMENT_NODE:
      return normalizeSimpleNode("comment", "#comment", node.nodeValue ?? "", parentPath, depth, nameCounts);
    case Node.CDATA_SECTION_NODE:
      return normalizeSimpleNode("cdata", "#cdata", node.nodeValue ?? "", parentPath, depth, nameCounts);
    case Node.PROCESSING_INSTRUCTION_NODE:
      return normalizeSimpleNode(
        "processing-instruction",
        `?${node.nodeName}`,
        node.nodeValue ?? "",
        parentPath,
        depth,
        nameCounts,
      );
    case Node.DOCUMENT_TYPE_NODE:
      return normalizeSimpleNode("doctype", `!DOCTYPE ${(node as DocumentType).name}`, "", parentPath, depth, nameCounts);
    default:
      return null;
  }
}

function normalizeElement(
  element: Element,
  parentPath: string,
  depth: number,
  limit: number,
  counter: Counter,
  nameCounts: Map<string, number>,
): XmlTreeNode {
  const path = childPath(parentPath, element.nodeName, nameCounts);
  const attributes = Array.from(element.attributes).map((attribute) => ({
    kind: "attribute" as const,
    name: attribute.name,
    value: attribute.value,
    path: `${path}/@${attribute.name}`,
    searchText: `${attribute.name} ${attribute.value}`.toLowerCase(),
  }));
  const children = normalizeChildren(element.childNodes, path, depth + 1, limit, counter);
  const directText = Array.from(element.childNodes)
    .filter((child) => child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE)
    .map((child) => child.nodeValue ?? "")
    .join(" ");

  const treeNode = createTreeNode({
    kind: "element",
    name: element.nodeName,
    value: "",
    path,
    depth,
    attributes,
  });
  treeNode.children = children;
  treeNode.childCount = children.length;
  treeNode.attributeCount = attributes.length;
  treeNode.textPreview = textPreview(directText || children.map((child) => child.textPreview).join(" "));
  treeNode.searchText = searchTextFor(treeNode);
  treeNode.truncated = counter.skipped > 0 && counter.rendered >= limit;
  return treeNode;
}

function normalizeText(
  node: ChildNode,
  parentPath: string,
  depth: number,
  nameCounts: Map<string, number>,
): XmlTreeNode | null {
  const value = node.nodeValue ?? "";
  if (!value.trim()) return null;
  return normalizeSimpleNode("text", "#text", value, parentPath, depth, nameCounts);
}

function normalizeSimpleNode(
  kind: XmlNodeKind,
  name: string,
  value: string,
  parentPath: string,
  depth: number,
  nameCounts: Map<string, number>,
): XmlTreeNode {
  const treeNode = createTreeNode({
    kind,
    name,
    value,
    path: childPath(parentPath, name, nameCounts),
    depth,
    attributes: [],
  });
  treeNode.textPreview = textPreview(value);
  treeNode.searchText = searchTextFor(treeNode);
  return treeNode;
}

function createTreeNode(input: {
  kind: XmlNodeKind;
  name: string;
  value: string;
  path: string;
  depth: number;
  attributes: XmlAttributeNode[];
}): XmlTreeNode {
  return {
    ...input,
    children: [],
    childCount: 0,
    attributeCount: input.attributes.length,
    textPreview: "",
    searchText: "",
  };
}

function childPath(parentPath: string, name: string, counts: Map<string, number>): string {
  const nextCount = (counts.get(name) ?? 0) + 1;
  counts.set(name, nextCount);
  const segment = `${name}[${nextCount}]`;
  if (parentPath === "/") return `/${segment}`;
  return `${parentPath}/${segment}`;
}

function searchTextFor(node: XmlTreeNode): string {
  return [
    node.kind,
    node.name,
    node.value,
    node.path,
    node.textPreview,
    ...node.attributes.map((attribute) => `${attribute.name} ${attribute.value}`),
  ]
    .join(" ")
    .toLowerCase();
}

function textPreview(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}

function findParserError(document: Document): string | null {
  const parserErrors = Array.from(document.getElementsByTagName("parsererror"));
  if (parserErrors.length === 0) return null;
  return parserErrors
    .map((error) => error.textContent?.replace(/\s+/g, " ").trim())
    .filter((message): message is string => Boolean(message))
    .join(" ");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Counter {
  total: number;
  rendered: number;
  skipped: number;
}
