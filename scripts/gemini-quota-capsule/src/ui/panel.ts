import {
  CSS_TARGETS,
  CUSTOM_ORNAMENT_KINDS,
  MAX_CSS_CHARS,
  MAX_IMAGE_BYTES,
  MAX_SVG_CHARS,
  ORNAMENT_MODES,
  PROGRESS_MODE_CHOICES,
} from "../config";
import { getOfficialUsageUrl } from "../core/account";
import { syncOfficialUsage } from "../core/sync";
import { config, saveConfig } from "../storage";
import type { MetricKind } from "../types";
import { applyCustomCss, el, svgEl } from "./dom";
import {
  applyComponentCss,
  applySvgSource,
  clearComponentCss,
  cycleOrnamentMode,
  handleImageFile,
  refreshCssEditor,
  setOrnament,
  setProgressMode,
  setStyleStatus,
  toggleSvgEditor,
} from "./elements";
import { bumpIconRevision, ornamentBtns, progressBtns, refs } from "./refs";
import { updateUI } from "./render";
import { injectStyles } from "./styles";

export function createDOM(): void {
  const existing = document.getElementById("gc-pill-root");
  if (existing) {
    // The id is ours, so it is a div; anything else leaves rootEl unset rather
    // than duplicating the id on a second node.
    refs.rootEl = existing instanceof HTMLDivElement ? existing : null;
    applyCustomCss();
    return;
  }

  injectStyles();

  refs.headSlotEl = el("button", {
    type: "button",
    "aria-label": "切换装饰图标",
    "data-gc-part": "head",
    className: "gc-capsule-head",
    title: "点击轮换装饰图标（棱镜 / 星芒 / 轨道 / 胶囊 / 闪电 / 无）",
    onclick: (e: Event) => {
      e.stopPropagation();
      cycleOrnamentMode();
    },
  });

  const badge5hEl = el("span", { className: "gc-pill-badge", "data-gc-part": "badge" }, ["5小时"]);
  refs.usage5hTextEl = el("span", { className: "gc-pill-counter", "data-gc-part": "counter" }, ["--%"]);
  refs.progress5hEl = el("span", {
    className: "gc-progress-slot",
    "data-gc-part": "progress",
  });
  refs.timer5hTextEl = el("span", { className: "gc-pill-timer", "data-gc-part": "timer" }, ["同步中"]);
  refs.group5hEl = el("div", { className: "gc-metric-group", "data-gc-part": "five-hour" }, [
    badge5hEl,
    refs.usage5hTextEl,
    refs.progress5hEl,
    refs.timer5hTextEl,
  ]);

  const badge7dEl = el("span", { className: "gc-pill-badge", "data-gc-part": "badge" }, ["每周"]);
  refs.usage7dTextEl = el("span", { className: "gc-pill-counter", "data-gc-part": "counter" }, ["--%"]);
  refs.progress7dEl = el("span", {
    className: "gc-progress-slot",
    "data-gc-part": "progress",
  });
  refs.timer7dTextEl = el("span", { className: "gc-pill-timer", "data-gc-part": "timer" }, ["同步中"]);
  refs.group7dEl = el("div", { className: "gc-metric-group", "data-gc-part": "weekly" }, [
    badge7dEl,
    refs.usage7dTextEl,
    refs.progress7dEl,
    refs.timer7dTextEl,
  ]);

  refs.syncDotEl = el("span", { className: "gc-sync-dot" });

  const refreshSvg = svgEl(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2.3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    [
      svgEl("path", {
        d: "M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2",
      }),
    ],
  );

  refs.btnRefreshEl = el(
    "button",
    {
      className: "gc-btn-icon",
      title: "立即同步官方最新用量与重置时间",
      onclick: (e: Event) => {
        e.stopPropagation();
        // syncOfficialUsage reserves the background tab synchronously; calling
        // it after any await would let the browser block the popup.
        void syncOfficialUsage(true);
      },
    },
    [refreshSvg],
  );

  const gearSvg = svgEl(
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    [
      svgEl("circle", { cx: "12", cy: "12", r: "3" }),
      svgEl("path", {
        d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z",
      }),
    ],
  );

  const btnSettings = el(
    "button",
    {
      className: "gc-btn-icon",
      title: "样式与数据源设置",
      onclick: (e: Event) => {
        e.stopPropagation();
        refs.drawerEl?.classList.toggle("gc-active");
      },
    },
    [gearSvg],
  );

  const actionsBox = el("div", { className: "gc-pill-actions", "data-gc-part": "actions" }, [
    refs.syncDotEl,
    refs.btnRefreshEl,
    btnSettings,
  ]);

  refs.pillContainerEl = el("div", { className: "gc-pill-container", "data-gc-part": "container" }, [
    refs.headSlotEl,
    refs.group5hEl,
    el("div", { className: "gc-v-divider", "data-gc-part": "divider" }),
    refs.group7dEl,
    el("div", { className: "gc-v-divider", "data-gc-part": "divider" }),
    actionsBox,
  ]);

  ornamentBtns.length = 0;
  for (const mode of ORNAMENT_MODES) {
    const btn = el(
      "button",
      {
        className: "gc-choice-btn",
        title: `装饰图标：${mode.text}`,
        onclick: () => {
          if (config.icon.kind === mode.key) return;
          if (setOrnament(mode.key)) {
            setStyleStatus(`已切换为「${mode.text}」装饰。`, "ok");
          }
        },
      },
      [mode.text],
    );
    btn.dataset["ornament"] = mode.key;
    ornamentBtns.push(btn);
  }

  const buildProgressGrid = (metricKey: MetricKind): HTMLDivElement => {
    const buttons: HTMLButtonElement[] = [];
    for (const mode of PROGRESS_MODE_CHOICES) {
      const btn = el(
        "button",
        {
          className: "gc-choice-btn",
          title: `进度样式：${mode.text}`,
          onclick: () => setProgressMode(metricKey, mode.key),
        },
        [mode.text],
      );
      btn.dataset["mode"] = mode.key;
      buttons.push(btn);
    }
    progressBtns[metricKey] = buttons;
    return el(
      "div",
      { className: "gc-mode-grid", "data-gc-metric": metricKey },
      buttons,
    );
  };

  refs.fileInputEl = el("input", {
    type: "file",
    accept: "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml",
    style: "display:none;",
  });
  const fileInput = refs.fileInputEl;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    await handleImageFile(file);
  });

  refs.imageBtnEl = el("button", {
    className: "gc-small-btn",
    "data-gc-action": "image-upload",
    title: `本地图片，最大 ${MAX_IMAGE_BYTES / 1024}KB`,
    onclick: (e: Event) => {
      e.stopPropagation();
      refs.fileInputEl?.click();
    },
  }, ["上传图片"]);
  refs.svgBtnEl = el("button", {
    className: "gc-small-btn",
    "data-gc-action": "svg-editor",
    title: "粘贴 SVG 源码，脚本会按白名单清洗",
    onclick: (e: Event) => {
      e.stopPropagation();
      toggleSvgEditor();
    },
  }, ["输入 SVG"]);
  const clearCustomBtn = el("button", {
    className: "gc-small-btn",
    "data-gc-action": "clear-custom",
    onclick: (e: Event) => {
      e.stopPropagation();
      const previous = { ...config.icon };
      config.icon.image = "";
      config.icon.svg = "";
      if (CUSTOM_ORNAMENT_KINDS.includes(config.icon.kind)) config.icon.kind = "prism";
      bumpIconRevision();
      if (!saveConfig(config)) {
        config.icon = previous;
        bumpIconRevision();
        setStyleStatus("清除失败：无法写入本地存储。", "error");
        updateUI();
        return;
      }
      toggleSvgEditor(false);
      setStyleStatus("已清除上传的图片与 SVG 资源。", "ok");
      updateUI();
    },
  }, ["清除资源"]);

  const svgTextarea = el("textarea", {
    className: "gc-textarea",
    maxlength: String(MAX_SVG_CHARS),
    spellcheck: "false",
    placeholder: '<svg viewBox="0 0 16 16"><path d="..." fill="currentColor"/></svg>',
  });
  refs.svgTextareaEl = svgTextarea;
  refs.svgEditorEl = el("div", { className: "gc-editor", hidden: true }, [
    el("div", { style: "font-size:9px; color:#64748b;" }, [
      `仅保留静态图形与渐变，上限 ${MAX_SVG_CHARS / 1024}KB。`,
    ]),
    svgTextarea,
    el("div", { className: "gc-editor-actions" }, [
      el("button", {
        className: "gc-small-btn",
        "data-gc-action": "svg-cancel",
        onclick: () => toggleSvgEditor(false),
      }, ["取消"]),
      el("button", {
        className: "gc-small-btn",
        "data-gc-action": "svg-apply",
        onclick: () => {
          if (applySvgSource(svgTextarea.value)) toggleSvgEditor(false);
        },
      }, ["应用 SVG"]),
    ]),
  ]);

  refs.cssTargetSelectEl = el("select", { className: "gc-select" }, CSS_TARGETS.map(
    (target) => el("option", { value: target.key }, [target.text]),
  ));
  refs.cssTargetSelectEl.addEventListener("change", refreshCssEditor);
  refs.cssTextareaEl = el("textarea", {
    className: "gc-textarea gc-css-textarea",
    maxlength: String(MAX_CSS_CHARS),
    spellcheck: "false",
    placeholder: "background: rgba(56,189,248,.12); border-color: #38bdf8;",
  });

  refs.styleStatusEl = el("div", { className: "gc-style-status" });

  const drawerTitle = el("div", { className: "gc-drawer-title" }, [
    el("span", {}, ["组件样式"]),
    el("span", { style: "font-size:9px; color:#64748b;" }, ["本地即时生效"]),
  ]);

  const drawerBody = el("div", { className: "gc-drawer-body" }, [
    refs.styleStatusEl,
    el("div", { className: "gc-drawer-section" }, [
      el("div", { className: "gc-section-label" }, [
        el("span", {}, ["装饰图标"]),
        el("span", { style: "color:#475569;" }, ["点击胶囊头部也可轮换"]),
      ]),
      el("div", { className: "gc-ornament-grid" }, ornamentBtns),
      el("div", { className: "gc-custom-row" }, [
        refs.imageBtnEl,
        refs.svgBtnEl,
        clearCustomBtn,
        refs.fileInputEl,
      ]),
      refs.svgEditorEl,
    ]),
    el("div", { className: "gc-drawer-section" }, [
      el("div", { className: "gc-section-label" }, [el("span", {}, ["5 小时进度"])]),
      buildProgressGrid("fiveHour"),
    ]),
    el("div", { className: "gc-drawer-section" }, [
      el("div", { className: "gc-section-label" }, [el("span", {}, ["每周进度"])]),
      buildProgressGrid("weekly"),
    ]),
    el("div", { className: "gc-drawer-section" }, [
      el("div", { className: "gc-section-label" }, [
        el("span", {}, ["组件 CSS"]),
        el("span", { style: "color:#475569;" }, ["只填声明"]),
      ]),
      refs.cssTargetSelectEl,
      refs.cssTextareaEl,
      el("div", { className: "gc-editor-actions" }, [
        el("button", {
          className: "gc-small-btn",
          "data-gc-action": "css-clear",
          onclick: clearComponentCss,
        }, ["恢复默认"]),
        el("button", {
          className: "gc-small-btn",
          "data-gc-action": "css-apply",
          onclick: applyComponentCss,
        }, ["应用 CSS"]),
      ]),
    ]),
  ]);

  refs.statusSourceEl = el("div", {}, ["数据源: 正在连接官方接口..."]);
  refs.statusSyncTimeEl = el("div", { style: "color:#64748b;" }, ["上次同步: --"]);
  const openOfficialLink = el(
    "span",
    {
      className: "gc-link-btn",
      onclick: () => window.open(getOfficialUsageUrl(), "_blank"),
    },
    ["打开官方 /usage 页面核对"],
  );

  refs.drawerEl = el("div", { id: "gc-pill-drawer", "data-gc-part": "drawer" }, [
    drawerTitle,
    drawerBody,
    el("div", { className: "gc-drawer-status" }, [
      refs.statusSourceEl,
      refs.statusSyncTimeEl,
      openOfficialLink,
    ]),
  ]);

  const rootEl = el(
    "div",
    {
      id: "gc-pill-root",
      style: `right:${config.pos.right}px; bottom:${config.pos.bottom}px;`,
    },
    [refs.pillContainerEl, refs.drawerEl],
  );

  refs.rootEl = rootEl;
  (document.body || document.documentElement).appendChild(rootEl);

  applyCustomCss();
  refreshCssEditor();
  bindDragEvents();
  updateUI();
}

export function bindDragEvents(): void {
  const pill = refs.pillContainerEl;
  const root = refs.rootEl;
  const drawer = refs.drawerEl;
  if (!pill || !root || !drawer) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialRight = 0;
  let initialBottom = 0;
  let hasMoved = false;

  pill.addEventListener("pointerdown", (e: PointerEvent) => {
    const target = e.target;
    if (target instanceof Element) {
      if (target.closest("button") || target.closest(".gc-capsule-head")) {
        return;
      }
    }
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    initialRight = config.pos.right;
    initialBottom = config.pos.bottom;
    pill.setPointerCapture(e.pointerId);
  });

  pill.addEventListener("pointermove", (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;

    const width = pill.offsetWidth || 240;
    const newRight = Math.max(
      6,
      Math.min(window.innerWidth - width - 6, initialRight - dx),
    );
    const newBottom = Math.max(
      6,
      Math.min(window.innerHeight - 30, initialBottom - dy),
    );

    root.style.right = `${newRight}px`;
    root.style.bottom = `${newBottom}px`;
  });

  const endDrag = (e: PointerEvent): void => {
    if (!isDragging) return;
    isDragging = false;
    try {
      pill.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture may already be released by the browser; dragging is
      // over either way.
    }
    if (hasMoved) {
      config.pos.right = parseInt(root.style.right, 10) || config.pos.right;
      config.pos.bottom =
        parseInt(root.style.bottom, 10) || config.pos.bottom;
      saveConfig(config);
    }
  };

  pill.addEventListener("pointerup", endDrag);
  pill.addEventListener("pointercancel", endDrag);

  document.addEventListener("pointerdown", (e: PointerEvent) => {
    if (!root.contains(e.target instanceof Node ? e.target : null)) {
      drawer.classList.remove("gc-active");
    }
  });
}

export function ensureMounted(): void {
  if (!document.body) return;
  const root = refs.rootEl;
  if (!root) {
    createDOM();
    return;
  }
  if (!root.isConnected) {
    document.body.appendChild(root);
  }
}
