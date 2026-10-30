import { BLOCK_TEXT_TAGS, CODE_FENCE, REASONING_SELECTOR } from '../config';
import { reportRecoverableError } from './diagnostics';

export function normalizeText(sourceText: string): string {
  return String(sourceText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function fastCountLines(text: string): number {
  if (!text) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function matchesReasoningElement(element: unknown): boolean {
  if (!(element instanceof Element)) return false;
  try {
    return element.matches(REASONING_SELECTOR);
  } catch (error: unknown) {
    reportRecoverableError("match reasoning element", error);
    return false;
  }
}

export function isReasoningElement(element: unknown): boolean {
  if (!(element instanceof Element)) return false;
  try {
    return (
      matchesReasoningElement(element) ||
      Boolean(element.closest(REASONING_SELECTOR))
    );
  } catch (error: unknown) {
    reportRecoverableError("resolve reasoning ancestor", error);
    return false;
  }
}

export function elementToPlainText(rootElement: unknown): string {
  if (
    !(rootElement instanceof Element) ||
    matchesReasoningElement(rootElement)
  ) {
    return "";
  }

  // Walk the live DOM without cloning large messages on each streaming mutation.
  // CSS dehydration/folding does not remove text nodes, so full text remains readable.
  const ignoredSelectors = [
    REASONING_SELECTOR,
    ".ai-turbo-chat-file-row",
    ".ai-turbo-chat-capsule",
    ".ai-turbo-code-bar",
    "#ai-turbo-vf-tray",
    "#ai-turbo-vf-preview-modal",
    "button",
    "[role='toolbar']",
    "script",
    "style",
    "svg",
    "[hidden]",
  ].join(", ");
  const preservedCodeBlocks: { token: string; codeText: string; language: string }[] = [];

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || "";
    }
    if (!(node instanceof Element)) {
      return Array.from(node.childNodes)
        .map(walk)
        .join("");
    }

    try {
      if (node !== rootElement && node.matches(ignoredSelectors)) return "";
    } catch (error: unknown) {
      reportRecoverableError("test ignored transcript selectors", error);
    }

    const tag = node.tagName.toUpperCase();
    if (tag === "BR") return "\n";
    if (tag === "PRE") {
      const codeText = node.textContent || "";
      const codeClasses = [
        node.className || "",
        node.querySelector("code")?.className || "",
        node.getAttribute("data-language") || "",
        node.querySelector("code")?.getAttribute("data-language") || "",
        node.querySelector("code")?.getAttribute("lang") || "",
      ].join(" ");
      const languageMatch = /language-([a-z0-9+#.-]+)/i.exec(codeClasses);
      const language = languageMatch
        ? (languageMatch[1] ?? "text").toLowerCase()
        : "text";
      const token = `\uE000TURBO_CODE_${preservedCodeBlocks.length}\uE001`;
      preservedCodeBlocks.push({ token, codeText, language });
      return `\n${CODE_FENCE}${language}\n${token}\n${CODE_FENCE}\n`;
    }

    const content: string = Array.from(node.childNodes).map(walk).join("");
    return BLOCK_TEXT_TAGS.has(tag) ? "\n" + content + "\n" : content;
  }

  let text = normalizeText(walk(rootElement));
  for (const block of preservedCodeBlocks) {
    const placeholder = `${CODE_FENCE}${block.language}\n${block.token}\n${CODE_FENCE}`;
    const preserved = `${CODE_FENCE}${block.language}\n${block.codeText}\n${CODE_FENCE}`;
    text = text.replace(placeholder, preserved);
  }
  return text;
}
