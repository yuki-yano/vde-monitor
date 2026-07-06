import { type CSSProperties, Fragment, type ReactNode, createElement, useMemo } from "react";

const EMPTY_LINE = "\u200B";

const allowedTags = new Set([
  "a",
  "br",
  "col",
  "colgroup",
  "div",
  "em",
  "i",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
]);

const opaqueDroppedTags = new Set(["iframe", "noscript", "script", "style", "textarea", "title"]);
const voidTags = new Set(["br", "col"]);

const allowedStyleProperties = new Set([
  "background-color",
  "color",
  "display",
  "font-style",
  "font-weight",
  "text-decoration",
  "white-space",
  "width",
]);

type TerminalHtmlLineProps = {
  html: string;
  className?: string;
};

const isSafeHref = (value: string) => {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const toReactStyleName = (name: string) =>
  name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

const readStyle = (element: Element): CSSProperties | undefined => {
  const style = element.getAttribute("style");
  if (!style) {
    return undefined;
  }
  const reactStyle: Record<string, string> = {};
  for (const rawEntry of style.split(";")) {
    const entry = rawEntry.trim();
    if (!entry) {
      continue;
    }
    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const rawName = entry.slice(0, separatorIndex).trim().toLowerCase();
    const value = entry.slice(separatorIndex + 1).trim();
    if (!value) {
      continue;
    }
    if (rawName.startsWith("--vde-")) {
      reactStyle[rawName] = value;
      continue;
    }
    if (allowedStyleProperties.has(rawName)) {
      reactStyle[toReactStyleName(rawName)] = value;
    }
  }
  return Object.keys(reactStyle).length > 0 ? (reactStyle as CSSProperties) : undefined;
};

const readProps = (element: Element, tagName: string, key: string) => {
  const props: Record<string, unknown> = { key };
  const className = element.getAttribute("class");
  if (className) {
    props.className = className;
  }
  const style = readStyle(element);
  if (style) {
    props.style = style;
  }
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith("data-vde-")) {
      props[attribute.name] = attribute.value;
    }
  }
  const role = element.getAttribute("role");
  if (role === "button") {
    props.role = role;
  }
  const tabIndex = element.getAttribute("tabindex");
  if (tabIndex === "0" || tabIndex === "-1") {
    props.tabIndex = Number(tabIndex);
  }
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    props["aria-label"] = ariaLabel;
  }
  if (tagName === "a") {
    const href = element.getAttribute("href");
    if (href && isSafeHref(href)) {
      props.href = new URL(href, window.location.href).href;
    }
    const target = element.getAttribute("target");
    if (target === "_blank") {
      props.target = target;
      props.rel = "noreferrer noopener";
    }
  }
  if (tagName === "col") {
    const span = element.getAttribute("span");
    if (span) {
      props.span = Number(span);
    }
  }
  return props;
};

const renderNodes = (
  nodes: NodeListOf<ChildNode> | ChildNode[],
  keyPrefix: string,
): ReactNode[] => {
  const renderedNodes: ReactNode[] = [];
  let index = 0;
  for (const node of Array.from(nodes)) {
    const renderedNode = renderNode(node, `${keyPrefix}-${index}`);
    index += 1;
    if (renderedNode != null) {
      renderedNodes.push(renderedNode);
    }
  }
  return renderedNodes;
};

const renderNode = (node: ChildNode, key: string): ReactNode | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  if (!allowedTags.has(tagName)) {
    if (opaqueDroppedTags.has(tagName)) {
      return null;
    }
    return renderNodes(element.childNodes, key);
  }
  if (voidTags.has(tagName)) {
    return createElement(tagName, readProps(element, tagName, key));
  }
  return createElement(
    tagName,
    readProps(element, tagName, key),
    renderNodes(element.childNodes, key),
  );
};

const renderHtml = (html: string) => {
  if (!html) {
    return EMPTY_LINE;
  }
  const document = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const container = document.body.firstElementChild;
  if (!container) {
    return EMPTY_LINE;
  }
  return renderNodes(container.childNodes, "terminal-html");
};

export const TerminalHtmlLine = ({ html, className }: TerminalHtmlLineProps) => {
  const children = useMemo(() => renderHtml(html), [html]);

  return <div className={className}>{children}</div>;
};

export const TerminalHtmlFragment = ({ html }: { html: string }) => {
  const children = useMemo(() => renderHtml(html), [html]);

  return <Fragment>{children}</Fragment>;
};
