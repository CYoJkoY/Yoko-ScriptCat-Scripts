import {
  CODE_FENCE,
  COMPOSER_VISUAL_MAX_DEPTH,
  VF_TOKEN_END,
  VF_TOKEN_START,
  VIRTUAL_FILE_THRESHOLD,
} from "../config";
import type { ComposerUtils } from "../core/composer";
import { reportRecoverableError } from "../core/diagnostics";
import { fastCountLines } from "../core/text";
import type { EngineState } from "../state";
import type { ElementFactory } from "./code-blocks";
import { createUiIcon } from "./icons";

export interface VirtualFileItem {
  id: string;
  name: string;
  lineCount: number;
  size: number;
  content: string;
  charCount?: number;
  timestamp?: number;
}

export interface VirtualFileDeps {
  el: ElementFactory;
  withSelfMutation: <T>(task: () => T) => T;
  composer: ComposerUtils;
  state: EngineState;
  isEngineDormant: () => boolean;
  updateHudDashboard: () => void;
  suspendObservers: () => void;
}

export interface VirtualFileUtils {
  stopTracking(): void;
  stopSyncLoop(): void;
  schedulePosition(): void;
  renderVirtualFileTray(): void;
  clearFiles(): void;
  activeFileCount(): number;
  isTrayDirty(): boolean;
  handlePasteIntercept(event: ClipboardEvent): void;
  fuseAndSubmit(inputElement: HTMLElement): boolean;
}

const VF_TRAY_SYNC_INTERVAL = 90; // ms

export function createVirtualFileUtils(
  deps: VirtualFileDeps,
): VirtualFileUtils {
  const {
    el,
    withSelfMutation,
    composer,
    state,
    isEngineDormant,
    updateHudDashboard,
    suspendObservers,
  } = deps;

  let activeVirtualFiles: VirtualFileItem[] = [];
  let trayIsDirty = false;
  let virtualFileTrayAnchor: HTMLElement | null = null;
  let virtualFileTrayResizeObserver: ResizeObserver | null = null;
  let virtualFileTrayPositionFrame = 0;
  let virtualFileTraySyncRaf = 0;
  let virtualFileTraySyncLastTs = 0;
  let virtualFileTrayLastSignature = "";
  let virtualFileTrayCachedInput: HTMLElement | null = null;

  interface LegacyClipboardData {
    getData(type: string): string;
  }
  function stopVirtualFileTrayTracking(): void {
    stopVirtualFileTraySyncLoop();

    if (virtualFileTrayResizeObserver) {
      virtualFileTrayResizeObserver.disconnect();
      virtualFileTrayResizeObserver = null;
    }

    virtualFileTrayAnchor = null;
    virtualFileTrayCachedInput = null;
    virtualFileTrayLastSignature = "";

    if (virtualFileTrayPositionFrame) {
      window.cancelAnimationFrame(virtualFileTrayPositionFrame);
      virtualFileTrayPositionFrame = 0;
    }
  }

  function resetVirtualFileTraySignature(): void {
    virtualFileTrayLastSignature = "";
  }

  function startVirtualFileTraySyncLoop(): void {
    if (virtualFileTraySyncRaf) return;
    virtualFileTraySyncLastTs = 0;

    const tick = (ts: number): void => {
      virtualFileTraySyncRaf = 0;

      const tray = document.getElementById("ai-turbo-vf-tray");
      if (!tray || !tray.isConnected || !activeVirtualFiles.length) {
        return;
      }

      if (ts - virtualFileTraySyncLastTs >= VF_TRAY_SYNC_INTERVAL) {
        virtualFileTraySyncLastTs = ts;
        positionVirtualFileTray();
      }

      virtualFileTraySyncRaf = window.requestAnimationFrame(tick);
    };

    virtualFileTraySyncRaf = window.requestAnimationFrame(tick);
  }

  function stopVirtualFileTraySyncLoop(): void {
    if (virtualFileTraySyncRaf) {
      window.cancelAnimationFrame(virtualFileTraySyncRaf);
      virtualFileTraySyncRaf = 0;
    }
    virtualFileTraySyncLastTs = 0;
  }

  function scheduleVirtualFileTrayPosition(): void {
    if (!activeVirtualFiles.length) return;
    if (virtualFileTrayPositionFrame) return;

    virtualFileTrayPositionFrame = window.requestAnimationFrame(() => {
      virtualFileTrayPositionFrame = 0;
      positionVirtualFileTray();
    });
  }

  function bindVirtualFileTrayObservers(
    anchor: HTMLElement,
    input: HTMLElement,
  ): void {
    if (virtualFileTrayResizeObserver) {
      virtualFileTrayResizeObserver.disconnect();
    }
    virtualFileTrayAnchor = anchor;

    if (!("ResizeObserver" in window)) return;

    virtualFileTrayResizeObserver = new ResizeObserver(() => {
      resetVirtualFileTraySignature();
      scheduleVirtualFileTrayPosition();
    });

    const observed = new Set<Element>();
    const observeNode = (node: unknown): void => {
      if (!(node instanceof Element)) return;
      if (node === document.body || node === document.documentElement) return;
      if (observed.has(node)) return;
      observed.add(node);
      if (!virtualFileTrayResizeObserver) return;
      try {
        virtualFileTrayResizeObserver.observe(node);
      } catch (error: unknown) {
        reportRecoverableError("observe tray layout", error);
      }
    };

    observeNode(input);
    let node: HTMLElement | null = anchor;
    let depth = 0;
    while (node && depth < COMPOSER_VISUAL_MAX_DEPTH) {
      observeNode(node);
      observeNode(node.parentElement);
      node = node.parentElement;
      depth++;
    }
  }

  function positionVirtualFileTray(): void {
    const tray = document.getElementById("ai-turbo-vf-tray");
    if (!tray || !tray.isConnected || !activeVirtualFiles.length) return;

    let input: HTMLElement | null = virtualFileTrayCachedInput;
    if (!input || !input.isConnected || input.getClientRects().length === 0) {
      input = composer.getChatInput();
      virtualFileTrayCachedInput = input;
    }

    if (!input || !input.isConnected) {
      tray.classList.remove("is-positioned");
      resetVirtualFileTraySignature();
      return;
    }

    const anchor = composer.getInputContainer(input);
    if (!anchor || !anchor.isConnected) {
      tray.classList.remove("is-positioned");
      resetVirtualFileTraySignature();
      return;
    }

    if (anchor !== virtualFileTrayAnchor) {
      bindVirtualFileTrayObservers(anchor, input);
    }

    const inputRect = input.getBoundingClientRect();
    if (!inputRect.width || !inputRect.height) {
      tray.classList.remove("is-positioned");
      resetVirtualFileTraySignature();
      return;
    }

    const bounds = composer.getComposerVisualBounds(input, anchor);

    const viewportPadding = 18;
    const verticalGap = 16;

    let visualTop =
      Number.isFinite(bounds.top) && bounds.top <= inputRect.top + 1
        ? bounds.top
        : inputRect.top;

    visualTop = Math.min(visualTop, inputRect.top);
    const minVisibleTop = viewportPadding + verticalGap + 60;
    visualTop = Math.max(minVisibleTop, Math.max(0, visualTop));
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableWidth = Math.max(0, viewportWidth - viewportPadding * 2);

    const baseWidth = Math.max(inputRect.width, bounds.width || 0);
    const trayWidth = Math.min(Math.max(baseWidth, 280), availableWidth);

    const anchorLeft = Math.min(inputRect.left, bounds.left);
    const left = Math.min(
      Math.max(viewportPadding, anchorLeft),
      Math.max(viewportPadding, viewportWidth - trayWidth - viewportPadding),
    );

    const finalBottom = Math.max(
      viewportPadding,
      viewportHeight - visualTop + verticalGap,
    );
    const maxTrayHeight = Math.max(
      72,
      visualTop - viewportPadding - verticalGap,
    );

    const signature = [
      Math.round(left * 10) / 10,
      Math.round(finalBottom * 10) / 10,
      Math.round(trayWidth * 10) / 10,
      Math.round(maxTrayHeight * 10) / 10,
    ].join("|");

    const isPositioned = tray.classList.contains("is-positioned");

    if (signature === virtualFileTrayLastSignature && isPositioned) {
      return;
    }
    virtualFileTrayLastSignature = signature;

    tray.style.width = `${trayWidth}px`;
    tray.style.left = `${left}px`;
    tray.style.top = "auto";
    tray.style.bottom = `${finalBottom}px`;
    tray.style.maxHeight = `${maxTrayHeight}px`;
    tray.style.overflowY = "auto";
    tray.dataset["placement"] = "top";

    if (!isPositioned) {
      tray.classList.add("is-positioned");
    }
  }

  function removeVirtualFile(id: string): void {
    activeVirtualFiles = activeVirtualFiles.filter((item) => item.id !== id);
    trayIsDirty = true;
    renderVirtualFileTray();
  }

  function showTextPreviewModal(fileItem: VirtualFileItem): void {
    document.getElementById("ai-turbo-vf-preview-modal")?.remove();

    const previewBackdrop = el("div", {
      id: "ai-turbo-vf-preview-modal",
      className: "ai-turbo-modal-backdrop",
      onclick: (event: Event) => {
        if (event.target === previewBackdrop) previewBackdrop.remove();
      },
    });

    const titleSpan = el(
      "span",
      {
        style:
          "font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f8fafc;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
      },
      [
        `📄 ${fileItem.name} (${fileItem.lineCount.toLocaleString()} 行 · ${(fileItem.size / 1024).toFixed(1)} KB)`,
      ],
    );

    const closeBtn = el(
      "button",
      {
        type: "button",
        style:
          "background:transparent;border:0;color:#94a3b8;cursor:pointer;font-size:16px;line-height:1;padding:4px;border-radius:4px;",
        onclick: () => previewBackdrop.remove(),
      },
      ["✕"],
    );

    const header = el(
      "div",
      {
        style:
          "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);",
      },
      [titleSpan, closeBtn],
    );

    const bodyText = el(
      "pre",
      {
        style:
          "flex:1 1 auto;min-height:0;margin:0;padding:16px;overflow-y:auto;overflow-x:auto;background:rgba(5,8,15,0.7);font:12px/1.6 ui-monospace,monospace;color:#cbd5e1;white-space:pre-wrap;word-break:break-all;",
      },
      [
        fileItem.content.slice(0, 8000) +
          (fileItem.content.length > 8000
            ? "\n\n... (预览仅截取前 8,000 字符，发送时将提交完整全部文本)"
            : ""),
      ],
    );

    const footerText = el(
      "span",
      { style: "font:11px sans-serif;color:#64748b;" },
      ["按 Esc 键或点击外部任意区域即可快速关闭"],
    );

    const footerCloseBtn = el(
      "button",
      {
        type: "button",
        style:
          "background:rgba(255,255,255,0.08);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;padding:4px 14px;border-radius:6px;font:11px sans-serif;cursor:pointer;",
        onclick: () => previewBackdrop.remove(),
      },
      ["关闭"],
    );

    const footer = el(
      "div",
      {
        style:
          "flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:10px 18px;border-top:1px solid rgba(148,163,184,0.15);background:rgba(18,24,38,0.98);",
      },
      [footerText, footerCloseBtn],
    );

    const modalBox = el(
      "div",
      {
        style:
          "background:#0d121c;border:1px solid rgba(52,211,153,0.35);box-shadow:0 24px 60px rgba(0,0,0,0.85);border-radius:14px;width:720px;max-width:94vw;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;",
      },
      [header, bodyText, footer],
    );

    previewBackdrop.appendChild(modalBox);
    document.body.appendChild(previewBackdrop);
  }

  function renderVirtualFileTray(): void {
    let tray: HTMLElement | null = document.getElementById("ai-turbo-vf-tray");

    resetVirtualFileTraySignature();

    if (!activeVirtualFiles.length) {
      const currentTray = tray;
      if (currentTray) {
        withSelfMutation(() => currentTray.remove());
      }

      stopVirtualFileTrayTracking();
      trayIsDirty = false;
      updateHudDashboard();
      return;
    }

    const input = composer.getChatInput();
    if (!input) return;
    const container = composer.getInputContainer(input);

    if (!container || !container.isConnected) {
      return;
    }

    withSelfMutation(() => {
      if (!tray) {
        tray = el("div", {
          id: "ai-turbo-vf-tray",
          className: "ai-turbo-vf-tray",
          role: "region",
          "aria-label": "虚拟文件",
        });

        document.body.appendChild(tray);
      }

      tray.textContent = "";

      const header = el(
        "div",
        {
          className: "ai-turbo-vf-header",
        },
        [
          el(
            "div",
            {
              className: "ai-turbo-vf-heading",
            },
            [
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-icon",
                },
                [createUiIcon("bolt", 13)],
              ),
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-title",
                },
                ["虚拟文件"],
              ),
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-count",
                },
                [`${activeVirtualFiles.length}`],
              ),
            ],
          ),

          el(
            "span",
            {
              className: "ai-turbo-vf-heading-hint",
            },
            ["发送时作为上下文附加"],
          ),
        ],
      );

      const fileList = el("div", {
        className: "ai-turbo-vf-list",
      });

      tray.appendChild(header);
      tray.appendChild(fileList);

      for (const item of activeVirtualFiles) {
        const sizeText = `${(item.size / 1024).toFixed(1)} KB`;

        const nameLabel = el(
          "span",
          {
            className: "ai-turbo-vf-name",
            title: item.name,
          },
          [item.name],
        );

        const metaLabel = el(
          "span",
          {
            className: "ai-turbo-vf-meta",
          },
          [`${item.lineCount.toLocaleString()} 行`, " · ", sizeText],
        );

        const btnPreview = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-action ai-turbo-vf-action-preview",
            title: "预览文本内容",
            "aria-label": `预览 ${item.name}`,
          },
          [createUiIcon("eye", 13)],
        );

        btnPreview.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          showTextPreviewModal(item);
        });

        const btnDelete = el(
          "button",
          {
            type: "button",
            className: "ai-turbo-vf-action ai-turbo-vf-action-delete",
            title: "移除该文件",
            "aria-label": `移除 ${item.name}`,
          },
          [createUiIcon("close", 13)],
        );

        btnDelete.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeVirtualFile(item.id);
        });

        const fileItem = el(
          "div",
          {
            className: "ai-turbo-vf-pill",
          },
          [
            el(
              "span",
              {
                className: "ai-turbo-vf-file-icon",
              },
              [createUiIcon("file", 14)],
            ),

            el(
              "div",
              {
                className: "ai-turbo-vf-file-copy",
              },
              [nameLabel, metaLabel],
            ),

            el(
              "span",
              {
                className: "ai-turbo-vf-badge",
              },
              ["TEXT"],
            ),

            el(
              "div",
              {
                className: "ai-turbo-vf-actions",
              },
              [btnPreview, btnDelete],
            ),
          ],
        );

        fileList.appendChild(fileItem);
      }

      trayIsDirty = false;
    });

    resetVirtualFileTraySignature();
    positionVirtualFileTray();
    startVirtualFileTraySyncLoop();
    updateHudDashboard();
  }

  function readLegacyClipboardData(): LegacyClipboardData | null {
    const legacy: unknown = Reflect.get(window, "clipboardData");
    if (typeof legacy !== "object" || legacy === null) return null;
    const getData: unknown = Reflect.get(legacy, "getData");
    if (typeof getData !== "function") return null;
    return {
      getData: (type: string): string => {
        const value: unknown = Reflect.apply(getData, legacy, [type]);
        return typeof value === "string" ? value : "";
      },
    };
  }

  function handlePasteIntercept(event: ClipboardEvent): void {
    if (isEngineDormant()) return;
    if (!state.virtualFileEnabled) return;

    const target = event.target;
    if (
      !(target instanceof Element) ||
      !target.closest(
        'rich-textarea, textarea, [contenteditable="true"], [role="textbox"]',
      )
    ) {
      return;
    }

    const clipData = event.clipboardData || readLegacyClipboardData();
    if (!clipData) return;

    const pastedText = clipData.getData("text/plain");
    if (!pastedText || pastedText.length < VIRTUAL_FILE_THRESHOLD) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const byteSize = new Blob([pastedText]).size;
    const kbSize = (byteSize / 1024).toFixed(1);
    const lineCount = fastCountLines(pastedText);
    const vfId = `vf_${Date.now()}`;
    const fileName = `pasted_text_${kbSize}kb.txt`;

    activeVirtualFiles.push({
      id: vfId,
      name: fileName,
      size: byteSize,
      charCount: pastedText.length,
      lineCount,
      content: pastedText,
      timestamp: Date.now(),
    });

    updateHudDashboard();
    trayIsDirty = true;
    renderVirtualFileTray();
  }

  function fuseAndSubmit(inputElement: HTMLElement): boolean {
    if (!activeVirtualFiles.length || !inputElement) return false;

    let userText = "";
    if (inputElement instanceof HTMLTextAreaElement) {
      userText = inputElement.value.trim();
    } else {
      userText = (
        inputElement.innerText ||
        inputElement.textContent ||
        ""
      ).trim();
    }

    const fileBlocks = activeVirtualFiles.map((vf) => {
      return `\n\n${CODE_FENCE}text\n${VF_TOKEN_START}${vf.name}|${vf.lineCount}|${vf.size}${VF_TOKEN_END}\n${vf.content}\n${CODE_FENCE}`;
    });

    const finalPrompt =
      (userText ? userText : "请查阅并分析以下文本内容：") +
      fileBlocks.join("\n");

    activeVirtualFiles = [];
    trayIsDirty = true;
    renderVirtualFileTray();

    suspendObservers();

    withSelfMutation(() => {
      composer.insertTextAtomic(inputElement, finalPrompt);
    });

    return true;
  }

  function clearFiles(): void {
    activeVirtualFiles = [];
    trayIsDirty = true;
    renderVirtualFileTray();
  }

  function activeFileCount(): number {
    return activeVirtualFiles.length;
  }

  function isTrayDirty(): boolean {
    return trayIsDirty;
  }

  return {
    stopTracking: stopVirtualFileTrayTracking,
    stopSyncLoop: stopVirtualFileTraySyncLoop,
    schedulePosition: scheduleVirtualFileTrayPosition,
    renderVirtualFileTray,
    clearFiles,
    activeFileCount,
    isTrayDirty,
    handlePasteIntercept,
    fuseAndSubmit,
  };
}
