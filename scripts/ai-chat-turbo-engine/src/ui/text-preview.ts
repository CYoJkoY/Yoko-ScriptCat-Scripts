import type { ElementFactory } from "./code-blocks";

/** Shares the id with the tray preview so old call sites keep ignoring it. */
export const TEXT_PREVIEW_MODAL_ID = "ai-turbo-vf-preview-modal";

/**
 * Long files are laid out lazily: the first slice paints immediately and the
 * rest is attached only when the reader asks for it. A pasted file can be
 * hundreds of kilobytes, and laying all of it out for a glance at the opening
 * lines is what makes a preview feel slow.
 */
export const TEXT_PREVIEW_CHAR_LIMIT = 12000;

export interface TextPreviewOptions {
  el: ElementFactory;
  name: string;
  meta: string;
  content: string;
  note?: string;
}

let restoreFocusTarget: Element | null = null;

/** Close the open preview. Returns false when no preview is mounted. */
export function closeTextPreview(): boolean {
  const modal = document.getElementById(TEXT_PREVIEW_MODAL_ID);
  if (!modal) return false;

  const target = restoreFocusTarget;
  modal.remove();
  restoreFocusTarget = null;

  if (target instanceof HTMLElement && target.isConnected) {
    target.focus({ preventScroll: true });
  }
  return true;
}

function copyWithTextarea(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "readonly");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;";
  document.body.appendChild(area);
  area.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission policies on some chat origins reject the async clipboard.
  }
  return copyWithTextarea(text);
}

function formatCount(value: number): string {
  return value.toLocaleString("zh-CN");
}

/**
 * Engine-owned preview window for one text payload.
 *
 * It is appended to `document.body` and positioned against the viewport, so it
 * does not depend on a platform's bubble, drawer, or markdown container and
 * works the same on every supported chat site.
 */
export function showTextPreview(options: TextPreviewOptions): void {
  const { el, name, meta, content, note } = options;
  const fullText = content ?? "";
  const focusSource = document.activeElement;

  closeTextPreview();
  restoreFocusTarget = focusSource instanceof HTMLElement ? focusSource : null;

  const backdrop = el("div", {
    id: TEXT_PREVIEW_MODAL_ID,
    className: "ai-turbo-modal-backdrop ai-turbo-text-preview",
  });
  backdrop.addEventListener("click", (event: Event) => {
    if (event.target === backdrop) closeTextPreview();
  });

  const titleNode = el(
    "span",
    { className: "ai-turbo-text-preview-name", title: name },
    [name],
  );
  const metaNode = el("span", { className: "ai-turbo-text-preview-meta" }, [
    meta,
  ]);
  const closeBtn = el(
    "button",
    {
      type: "button",
      className: "ai-turbo-text-preview-close",
      title: "关闭预览",
      "aria-label": "关闭预览",
    },
    ["✕"],
  );
  closeBtn.addEventListener("click", () => closeTextPreview());

  const header = el("div", { className: "ai-turbo-text-preview-header" }, [
    el("div", { className: "ai-turbo-text-preview-heading" }, [
      titleNode,
      metaNode,
    ]),
    closeBtn,
  ]);

  const body = el("pre", {
    className: "ai-turbo-text-preview-body",
    tabindex: "0",
  });

  const renderBody = (limit: number): void => {
    body.textContent = fullText
      ? fullText.slice(0, limit)
      : "（这条消息里没有可预览的正文）";
  };
  renderBody(TEXT_PREVIEW_CHAR_LIMIT);

  const charCount = fullText.length;
  const lineCount = fullText ? fullText.split("\n").length : 0;
  const info = el("span", { className: "ai-turbo-text-preview-info" }, [
    `${formatCount(charCount)} 字符 · ${formatCount(lineCount)} 行`,
    ...(note ? [` · ${note}`] : []),
  ]);

  const actions = el("div", { className: "ai-turbo-text-preview-actions" });

  if (charCount > TEXT_PREVIEW_CHAR_LIMIT) {
    const expandBtn = el(
      "button",
      { type: "button", className: "ai-turbo-text-preview-action" },
      [`显示全部（${formatCount(charCount)} 字符）`],
    );
    expandBtn.addEventListener("click", () => {
      renderBody(charCount);
      expandBtn.remove();
    });
    actions.appendChild(expandBtn);
  }

  const copyBtn = el(
    "button",
    { type: "button", className: "ai-turbo-text-preview-action" },
    ["复制全部"],
  );
  copyBtn.addEventListener("click", () => {
    void copyText(fullText).then((copied) => {
      copyBtn.textContent = copied ? "已复制" : "复制失败";
      window.setTimeout(() => {
        if (copyBtn.isConnected) copyBtn.textContent = "复制全部";
      }, 1600);
    });
  });
  actions.appendChild(copyBtn);

  const footer = el("div", { className: "ai-turbo-text-preview-footer" }, [
    info,
    actions,
  ]);

  const dialog = el(
    "div",
    {
      className: "ai-turbo-text-preview-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": `${name} 预览`,
    },
    [header, body, footer],
  );

  dialog.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTextPreview();
      return;
    }
    if (event.key !== "Tab") return;

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>("button:not([disabled])"),
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  closeBtn.focus({ preventScroll: true });
}
