import { BLOCK_TEXT_TAGS, CODE_FENCE, REASONING_SELECTOR } from '../config';
import { reportRecoverableError } from './diagnostics';

const TRANSCRIPT_IGNORED_SELECTORS = [
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

/** HTML elements expose a lower-case localName; normalize the set once. */
const BLOCK_TEXT_LOCAL_NAMES = new Set(
  Array.from(BLOCK_TEXT_TAGS, (tag) => tag.toLowerCase()),
);

/* Native tags that are always skipped. Checking localName first avoids a
   compound selector match on every icon, toolbar button, and thought block. */
const TRANSCRIPT_IGNORED_LOCAL_NAMES = new Set([
  "button",
  "model-thoughts",
  "script",
  "style",
  "svg",
]);

export function normalizeText(sourceText: string): string {
  return String(sourceText || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    /* Line ends and blank runs are rewritten in one pass each: a long answer
       is normalized on every text index tick, so no per-line array is built. */
    .replace(/[ \t]+$/gm, "")
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
  // One shared chunk list avoids an array and a join per element, which added up
  // to thousands of short-lived allocations on a long Gemini answer.
  const chunks: string[] = [];
  const preservedCodeBlocks: { token: string; codeText: string; language: string }[] = [];

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue;
      if (value) chunks.push(value);
      return;
    }
    if (!(node instanceof Element)) {
      for (const child of node.childNodes) walk(child);
      return;
    }

    const tag = node.localName;
    if (node !== rootElement) {
      if (
        TRANSCRIPT_IGNORED_LOCAL_NAMES.has(tag) ||
        node.hasAttribute("hidden")
      ) {
        return;
      }
      try {
        if (node.matches(TRANSCRIPT_IGNORED_SELECTORS)) return;
      } catch (error: unknown) {
        reportRecoverableError("test ignored transcript selectors", error);
      }
    }

    if (tag === "br") {
      chunks.push("\n");
      return;
    }
    if (tag === "pre") {
      const codeText = node.textContent || "";
      const codeChild = node.querySelector("code");
      const codeClasses = [
        node.className || "",
        codeChild?.className || "",
        node.getAttribute("data-language") || "",
        codeChild?.getAttribute("data-language") || "",
        codeChild?.getAttribute("lang") || "",
      ].join(" ");
      const languageMatch = /language-([a-z0-9+#.-]+)/i.exec(codeClasses);
      const language = languageMatch
        ? (languageMatch[1] ?? "text").toLowerCase()
        : "text";
      const token = `\uE000TURBO_CODE_${preservedCodeBlocks.length}\uE001`;
      preservedCodeBlocks.push({ token, codeText, language });
      chunks.push(`\n${CODE_FENCE}${language}\n${token}\n${CODE_FENCE}\n`);
      return;
    }

    const isBlock = BLOCK_TEXT_LOCAL_NAMES.has(tag);
    if (isBlock) chunks.push("\n");
    for (const child of node.childNodes) walk(child);
    if (isBlock) chunks.push("\n");
  }

  walk(rootElement);
  const text = normalizeText(chunks.join(""));
  if (preservedCodeBlocks.length === 0) return text;
  /* One pass restores every fence placeholder. Replacing one block at a time
     rescanned the whole message once per code block. */
  return text.replace(/\uE000TURBO_CODE_(\d+)\uE001/g, (token, rawIndex) => {
    const block = preservedCodeBlocks[Number(rawIndex)];
    return block ? block.codeText : token;
  });
}
