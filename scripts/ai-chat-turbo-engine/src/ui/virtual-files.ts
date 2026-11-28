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
import { showTextPreview } from "./text-preview";

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
  /** Keep the tray aligned with long text typed (not pasted) in the composer. */
  handleComposerInput(target: EventTarget | null): void;
  clearFiles(): void;
  activeFileCount(): number;
  isTrayDirty(): boolean;
  /** True while the tray holds only the long-text conversion offer. */
  hasConversionOffer(): boolean;
  /** Retire the conversion offer because the message is being sent. */
  dismissConversionOffer(): void;
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
  /**
   * Composer text the user already declined to convert, or converted out of a
   * file. Keyed by text rather than by node because the host re-creates the
   * composer on every route change and sends, which would otherwise bring the
   * same offer straight back.
   */
  let conversionDismissedText: string | null = null;
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
      if (!tray || !tray.isConnected) {
        return;
      }

      if (ts - virtualFileTraySyncLastTs >= VF_TRAY_SYNC_INTERVAL) {
        virtualFileTraySyncLastTs = ts;

        /*
         * A route change can swap the composer while a prompt-only tray is
         * still on screen, and nothing dispatches an input event for the new,
         * empty node. The node check stays cheap on the common path: only a
         * detached or unpainted composer triggers a fresh lookup. The tray is
         * then dropped unless the new composer still asks for a conversion,
         * so a detached editor cannot leave the tray behind.
         */
        if (activeVirtualFiles.length === 0) {
          const cached = virtualFileTrayCachedInput;
          if (!trayInputIsUsable()) {
            const input = composer.getChatInput();
            if (input === null || !refreshConversionOffer(input)) {
              removeVirtualFileTray();
              return;
            }
            virtualFileTrayCachedInput = input;
          } else if (cached && composerMayBeBelowThreshold(cached)) {
            /*
             * Sending clears the composer on the host side, and several hosts
             * never dispatch an input event for that change. Without a
             * re-check the conversion offer would keep hanging above an empty
             * box, so sweep the prompt-only tray while it is on screen.
             */
            if (!refreshConversionOffer(cached)) {
              removeVirtualFileTray();
              return;
            }
          }
        }

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
    if (virtualFileTrayAnchor === null) return;
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
    /**
     * Gemini inserts its attachment preview above the editor without changing
     * the editor's own box, so the tray needs the sibling that lifts the
     * composer container, not only the editor and its ancestors.
     */
    let sibling: Element | null = input.previousElementSibling;
    let siblingDepth = 0;
    while (sibling && siblingDepth < COMPOSER_VISUAL_MAX_DEPTH) {
      observeNode(sibling);
      sibling = sibling.previousElementSibling;
      siblingDepth++;
    }
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
    if (!tray || !tray.isConnected) return;

    const input = resolveTrayInput();

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

    /**
     * Gemini paints uploaded previews beside the editor inside its own
     * container, so the editor's top edge stays put while the whole input
     * area grows upward. The editor rect alone would then leave the tray over
     * the previews; the container rect is the lift the user actually sees.
     * On plain composers the container only wraps the editor, so this is the
     * same edge and keeps multi-line growth working unchanged.
     */
    const container = composer.getInputContainer(input);
    const containerRect = container?.getBoundingClientRect();
    const visualTopCandidate = containerRect
      ? Math.min(bounds.top, containerRect.top)
      : bounds.top;

    const viewportPadding = 18;
    const verticalGap = 16;

    let visualTop =
      Number.isFinite(visualTopCandidate) &&
      visualTopCandidate <= inputRect.top + 1
        ? visualTopCandidate
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
    showTextPreview({
      el,
      name: fileItem.name,
      meta: `${fileItem.lineCount.toLocaleString("zh-CN")} 行 · ${(fileItem.size / 1024).toFixed(1)} KB`,
      content: fileItem.content,
      note: "发送时会提交完整文本",
    });
  }

  function readComposerText(inputElement: HTMLElement | null): string {
    if (!inputElement) return "";
    if (inputElement instanceof HTMLTextAreaElement) return inputElement.value;
    if (inputElement instanceof HTMLInputElement) return inputElement.value;
    return (
      inputElement.innerText || inputElement.textContent || ""
    ).replace(/\u00a0/g, " ");
  }

  /**
   * The composer the tray belongs to. The cached node wins while it is still
   * painted: a host that re-renders the transcript can briefly mount a second
   * editor, and the tray must not jump to it.
   */
  function resolveTrayInput(): HTMLElement | null {
    const cached = virtualFileTrayCachedInput;
    if (cached && trayInputIsUsable()) return cached;
    const current = composer.getChatInput();
    virtualFileTrayCachedInput = current;
    return current;
  }

  function trayInputIsUsable(): boolean {
    const cached = virtualFileTrayCachedInput;
    if (!cached) return false;
    return cached.isConnected && cached.getClientRects().length > 0;
  }

  /**
   * Read the composer and answer whether the conversion offer belongs on
   * screen. Not pure: the dismissal only survives while the text still
   * matches, so dropping below the threshold clears it here. Every caller
   * already runs on an input, render, or frame tick where that reset is
   * wanted, which keeps the suppression from leaking into the next long text.
   */
  function refreshConversionOffer(input: HTMLElement | null): boolean {
    const text = readComposerText(input).trim();
    if (text.length < VIRTUAL_FILE_THRESHOLD) {
      conversionDismissedText = null;
      return false;
    }
    return text !== conversionDismissedText;
  }

  /**
   * Cheap pre-check for the periodic sweep: a textarea value or raw
   * `textContent` needs no layout, so only a composer that looks short pays
   * for the `innerText` read inside `refreshConversionOffer`.
   */
  function composerMayBeBelowThreshold(input: HTMLElement): boolean {
    const raw =
      input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement
        ? input.value
        : (input.textContent ?? "");
    // Trimming only shortens the text, so a raw string below the threshold
    // answers without copying a long composer on every tick.
    if (raw.length < VIRTUAL_FILE_THRESHOLD) return true;
    return raw.trim().length < VIRTUAL_FILE_THRESHOLD;
  }

  function hasConversionOffer(): boolean {
    if (activeVirtualFiles.length > 0) return false;
    const tray = document.getElementById("ai-turbo-vf-tray");
    return tray !== null && tray.isConnected;
  }

  /**
   * The user just sent the message the offer pointed at, so the tray must not
   * survive the send. The text is remembered as dismissed in case the host
   * echoes the old content back with an input event.
   */
  function dismissConversionOffer(): void {
    if (!hasConversionOffer()) return;
    conversionDismissedText = readComposerText(
      composer.getChatInput(),
    ).trim();
    removeVirtualFileTray();
  }

  /** Drop the tray and its layout tracking; nothing is left on the page. */
  function removeVirtualFileTray(): void {
    const current = document.getElementById("ai-turbo-vf-tray");
    if (current) {
      withSelfMutation(() => current.remove());
    }

    stopVirtualFileTrayTracking();
    trayIsDirty = false;
    updateHudDashboard();
  }

  /**
   * Typing a long text is the reverse of pasting one: the tray offers the
   * conversion action as soon as the composer crosses the same threshold.
   */
  function handleComposerInput(target: EventTarget | null): void {
    if (isEngineDormant() || !state.virtualFileEnabled) return;
    if (!(target instanceof Node)) return;
    if (!isEditableTarget(target)) return;

    const input = composer.getChatInput();
    if (!input) return;
    if (!input.contains(target)) return;

    const offerConversion = refreshConversionOffer(input);
    const wanted = activeVirtualFiles.length > 0 || offerConversion;
    const present =
      document.getElementById("ai-turbo-vf-tray") !== null;
    if (wanted === present) return;

    trayIsDirty = true;
    renderVirtualFileTray();
  }

  /** Composer typing arrives on a textarea, an input, or a contenteditable. */
  function isEditableTarget(target: Node): boolean {
    if (target instanceof HTMLTextAreaElement) return true;
    if (target instanceof HTMLInputElement) return true;
    return target instanceof HTMLElement && target.isContentEditable;
  }

  function buildVirtualFile(text: string, prefix: string): VirtualFileItem {
    const size = new Blob([text]).size;
    const kbSize = (size / 1024).toFixed(1);
    return {
      id: `vf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${prefix}_${kbSize}kb.txt`,
      size,
      charCount: text.length,
      lineCount: fastCountLines(text),
      content: text,
      timestamp: Date.now(),
    };
  }

  /**
   * Move the composer text into the tray. The text itself is untouched, so
   * pressing the tray's convert action again returns it to the composer.
   */
  function moveComposerTextToFiles(): boolean {
    const input = composer.getChatInput();
    if (!input) return false;

    const text = readComposerText(input).trim();
    if (!text) return false;

    activeVirtualFiles.push(buildVirtualFile(text, "composer_text"));
    suspendObservers();
    withSelfMutation(() => {
      composer.insertTextAtomic(input, "");
    });

    updateHudDashboard();
    trayIsDirty = true;
    renderVirtualFileTray();
    return true;
  }

  /** Return one pending file to the composer as ordinary text. */
  function convertFileToText(fileItem: VirtualFileItem): void {
    const input = composer.getChatInput();
    if (!input) return;

    const current = readComposerText(input).trim();
    const next = current
      ? `${current}\n\n${fileItem.content}`
      : fileItem.content;

    suspendObservers();
    withSelfMutation(() => {
      composer.insertTextAtomic(input, next);
    });
    conversionDismissedText = readComposerText(input).trim();
    removeVirtualFile(fileItem.id);
  }

  function renderVirtualFileTray(): void {
    let tray: HTMLElement | null = document.getElementById("ai-turbo-vf-tray");

    resetVirtualFileTraySignature();

    const input = composer.getChatInput();
    const convertOnly = activeVirtualFiles.length === 0;
    if (
      convertOnly &&
      (!state.virtualFileEnabled ||
        isEngineDormant() ||
        !refreshConversionOffer(input))
    ) {
      removeVirtualFileTray();
      return;
    }

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

      const headingChildren: (string | Node)[] = [
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
      ];
      if (activeVirtualFiles.length) {
        headingChildren.push(
          el(
            "span",
            {
              className: "ai-turbo-vf-heading-count",
            },
            [`${activeVirtualFiles.length}`],
          ),
        );
      }

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
            headingChildren,
          ),

          el(
            "div",
            {
              className: "ai-turbo-vf-header-actions",
            },
            [
              el(
                "span",
                {
                  className: "ai-turbo-vf-heading-hint",
                },
                [
                  activeVirtualFiles.length
                    ? "发送时作为上下文附加"
                    : "输入框里有长文本",
                ],
              ),
              el(
                "button",
                {
                  type: "button",
                  className: "ai-turbo-vf-convert-composer",
                  title: "把输入框里的文本收进虚拟文件",
                  "aria-label": "把输入框里的文本转为虚拟文件",
                },
                ["文本转文件"],
              ),
            ],
          ),
        ],
      );

      tray.appendChild(header);

      header
        .querySelector<HTMLButtonElement>(".ai-turbo-vf-convert-composer")
        ?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          moveComposerTextToFiles();
        });

      if (convertOnly) {
        const dismiss = el("button", {
          type: "button",
          className: "ai-turbo-vf-action ai-turbo-vf-dismiss-conversion",
          title: "关闭转换提示",
          "aria-label": "关闭转换提示",
        }, [createUiIcon("close", 13)]);
        dismiss.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          conversionDismissedText = readComposerText(
            composer.getChatInput(),
          ).trim();
          renderVirtualFileTray();
        });
        header.querySelector(".ai-turbo-vf-header-actions")?.appendChild(dismiss);
      }

      const fileList = el("div", {
        className: "ai-turbo-vf-list",
      });
      // A prompt-only tray owns no files, so it skips the empty list row.
      if (!convertOnly) tray.appendChild(fileList);
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

        const btnConvert = el(
          "button",
          {
            type: "button",
            className:
              "ai-turbo-vf-action ai-turbo-vf-action-label ai-turbo-vf-action-convert",
            title: "把该文件放回输入框作为普通文本",
            "aria-label": `将 ${item.name} 转为普通文本`,
          },
          ["转文本"],
        );

        btnConvert.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          convertFileToText(item);
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
              [btnPreview, btnConvert, btnDelete],
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

    suspendObservers();

    withSelfMutation(() => {
      composer.insertTextAtomic(inputElement, finalPrompt);
    });
    conversionDismissedText = readComposerText(inputElement).trim();
    clearFiles();

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
    hasConversionOffer,
    dismissConversionOffer,
    handlePasteIntercept,
    handleComposerInput,
    fuseAndSubmit,
  };
}
