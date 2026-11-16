// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUTTON_ATTRIBUTE,
  FLOATING_BUTTON_CLASS,
  FRAME_CHANNEL,
} from "../scripts/web-fullscreen/src/config";
import { createWebFullscreenController } from "../scripts/web-fullscreen/src/core/controller";
import { findPlayerMatch } from "../scripts/web-fullscreen/src/core/detect";
import { installFrameBridge } from "../scripts/web-fullscreen/src/core/frameBridge";
import { createScrollLock } from "../scripts/web-fullscreen/src/core/scrollLock";
import { installWebFullscreen } from "../scripts/web-fullscreen/src/install";
import meta from "../scripts/web-fullscreen/meta";
import {
  createFullscreenButton,
  insertBeforeFullscreen,
} from "../scripts/web-fullscreen/src/ui/button";
import { fitInControlBar } from "../scripts/web-fullscreen/src/ui/layout";

const cleanups: (() => void)[] = [];

function stubVideoRect(video: HTMLVideoElement): void {
  Object.defineProperty(video, "getBoundingClientRect", {
    configurable: true,
    value: (): DOMRect => new DOMRect(0, 0, 640, 360),
  });
}

function mountCustomPlayer(): {
  video: HTMLVideoElement;
  player: HTMLElement;
  anchor: HTMLButtonElement;
} {
  document.body.innerHTML = `
    <div class="player" style="position: absolute; width: 640px; height: 360px">
      <video style="width: 100%; height: 100%"></video>
      <div class="player-controls">
        <button id="native-fullscreen" class="player-btn" aria-label="进入全屏" title="全屏">全屏</button>
      </div>
    </div>
  `;
  const player = document.querySelector<HTMLElement>(".player");
  const video = document.querySelector<HTMLVideoElement>("video");
  const anchor = document.querySelector<HTMLButtonElement>("#native-fullscreen");
  if (player === null || video === null || anchor === null) {
    throw new Error("The player fixture is incomplete");
  }
  stubVideoRect(video);
  return { video, player, anchor };
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
  Reflect.deleteProperty(document, "fullscreenElement");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function activatePlayer(player: HTMLElement): Promise<void> {
  player.dispatchEvent(new Event("pointerover", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 220));
}

describe("player detection", () => {
  it("finds the native fullscreen control in the nearest player wrapper", () => {
    const { video, player, anchor } = mountCustomPlayer();
    const match = findPlayerMatch(video);
    expect(match.mode).toBe("custom");
    expect(match.root).toBe(player);
    expect(match.fullscreenButton).toBe(anchor);
  });

  it("skips injection when the player already exposes web fullscreen", () => {
    document.body.innerHTML = `
      <div class="player">
        <video></video>
        <div class="player-controls">
          <button aria-label="网页全屏">网页全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector("video");
    if (video === null) throw new Error("The video fixture is missing");
    expect(findPlayerMatch(video).mode).toBe("skip");
  });

  it("falls back to native controls when no fullscreen anchor exists", () => {
    document.body.innerHTML = '<div class="player"><video></video></div>';
    const video = document.querySelector("video");
    if (video === null) throw new Error("The video fixture is missing");
    const match = findPlayerMatch(video);
    expect(match.mode).toBe("native");
    expect(match.root).toBe(video);
  });
});

describe("web fullscreen button", () => {
  it("clones the native control, removes state, and inserts before it", () => {
    const { video, anchor } = mountCustomPlayer();
    anchor.setAttribute("data-role", "fullscreen");
    anchor.classList.add("is-active");

    const match = findPlayerMatch(video);
    const button = createFullscreenButton(match);
    expect(insertBeforeFullscreen(match, button)).toBe(true);

    expect(anchor.parentElement?.children[0]).toBe(button);
    expect(button.nextElementSibling).toBe(anchor);
    expect(button.hasAttribute("id")).toBe(false);
    expect(button.hasAttribute("data-role")).toBe(false);
    expect(button.classList.contains("is-active")).toBe(false);
    expect(button.hasAttribute(BUTTON_ATTRIBUTE)).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("网页全屏");
    expect(button.querySelector("svg")).not.toBeNull();
  });
});

describe("control bar spacing", () => {
  function mountAnchor(barStyle: string): {
    bar: HTMLElement;
    anchor: HTMLButtonElement;
  } {
    document.body.innerHTML = `
      <div class="bar" style="${barStyle}">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || anchor === null) {
      throw new Error("The control bar fixture is incomplete");
    }
    return { bar, anchor };
  }

  it("reserves natural width and fallback gaps in a flex bar", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    const prev = bar.querySelector<HTMLElement>(".prev");
    if (prev === null) throw new Error("The previous control is missing");
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("flex-grow")).toBe("0");
    expect(button.style.getPropertyValue("flex-shrink")).toBe("0");
    expect(button.style.getPropertyValue("flex-basis")).toBe("auto");
    expect(button.style.getPropertyValue("margin-inline-start")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("5.6px");
    expect(prev.style.getPropertyValue("translate")).toBe("");
  });

  it("uses an existing flex column gap instead of adding margins", () => {
    const { bar, anchor } = mountAnchor("display: flex; column-gap: 12px");
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-inline-start")).toBe("");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("");
  });

  it("uses the row gap as the main-axis spacing of a flex column", () => {
    const { bar, anchor } = mountAnchor(
      "display: flex; flex-direction: column; row-gap: 12px",
    );
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-block-start")).toBe("");
    expect(button.style.getPropertyValue("margin-block-end")).toBe("");
    expect(button.style.getPropertyValue("margin-inline-start")).toBe("");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("");
  });

  it("adds block margins when a flex column has no row gap", () => {
    const { bar, anchor } = mountAnchor(
      "display: flex; flex-direction: column; column-gap: 12px",
    );
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-block-start")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-block-end")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-inline-start")).toBe("");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("");
  });

  it("fills only the sides the native leading margin does not cover", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.marginLeft = "10px";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    // The clone drops ID- and data-* selectors, so its own margin cannot be
    // assumed: the button still needs a leading gap in front of itself.
    expect(button.style.getPropertyValue("margin-inline-start")).toBe("5.6px");
    // The anchor keeps its margin, which already separates it from the button.
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("");
  });

  it("keeps its own margins when the cloned control already has them", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.marginLeft = "10px";
    const button = document.createElement("button");
    button.style.marginLeft = "10px";
    button.style.marginRight = "10px";
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-inline-start")).toBe("");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("");
  });

  it("treats anchor margin-left as outer in a row-reverse flex bar", () => {
    const { bar, anchor } = mountAnchor(
      "display: flex; flex-direction: row-reverse",
    );
    anchor.style.marginLeft = "10px";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-inline-start")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("5.6px");
  });

  it("uses anchor margin-right toward the button in a row-reverse flex bar", () => {
    const { bar, anchor } = mountAnchor(
      "display: flex; flex-direction: row-reverse",
    );
    anchor.style.marginRight = "10px";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-inline-start")).toBe("");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("5.6px");
  });

  it("chooses the inner anchor margin side in a column-reverse flex bar", () => {
    const { bar, anchor } = mountAnchor(
      "display: flex; flex-direction: column-reverse",
    );
    anchor.style.marginTop = "10px";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-block-start")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-block-end")).toBe("5.6px");

    fit.dispose();
    anchor.style.marginTop = "";
    anchor.style.marginBottom = "10px";

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-block-start")).toBe("");
    expect(button.style.getPropertyValue("margin-block-end")).toBe("5.6px");
  });

  it("maps inline physical margins using RTL direction in a flex bar", () => {
    const { bar, anchor } = mountAnchor("display: flex; direction: rtl");
    anchor.style.marginLeft = "10px";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-inline-start")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("5.6px");

    fit.dispose();
    anchor.style.marginLeft = "";
    anchor.style.marginRight = "10px";

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("margin-inline-start")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("");
  });

  it("keeps an RTL clone in flow when the anchor is absolutely positioned", () => {
    const { bar, anchor } = mountAnchor("display: flex; direction: rtl");
    anchor.style.position = "absolute";
    anchor.style.top = "0";
    anchor.style.right = "0";
    const button = document.createElement("button");
    button.style.position = "relative";
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    // The cluster shift is skipped in RTL, so copying `absolute` would remove
    // the clone from the bar and let it overlap its neighbours.
    expect(button.style.getPropertyValue("position")).toBe("relative");
    expect(button.style.getPropertyValue("margin-inline-start")).toBe("5.6px");
    expect(button.style.getPropertyValue("margin-inline-end")).toBe("5.6px");

    fit.dispose();
    expect(button.style.getPropertyValue("position")).toBe("relative");
  });

  it("shifts an absolute button and its preceding controls left", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The absolute control bar fixture is incomplete");
    }
    bar.style.position = "relative";
    anchor.style.position = "absolute";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(480, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(520, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(520, 0, 40, 20),
    });

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("absolute");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-51.2px 0");

    fit.dispose();
    expect(button.style.getPropertyValue("position")).toBe("");
    expect(button.style.getPropertyValue("translate")).toBe("");
    expect(prev.style.getPropertyValue("translate")).toBe("");
  });

  it("moves only the button when the absolute cluster has no preceding control", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || anchor === null) {
      throw new Error("The absolute anchor fixture is incomplete");
    }
    anchor.style.position = "absolute";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(520, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(520, 0, 40, 20),
    });

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(bar.style.getPropertyValue("translate")).toBe("");
  });

  it("still pushes a preceding control when the button is already left of the anchor", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The offset control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(480, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(500, 0, 30, 20),
    });

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("translate")).toBe("");
    expect(prev.style.getPropertyValue("translate")).toBe("-25.6px 0");
  });

  it("composes the shift with the translation a control already has", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The translated control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    prev.style.translate = "10px 0";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe(
      "calc(10px - 41.2px) 0",
    );

    fit.dispose();
    expect(prev.style.getPropertyValue("translate")).toBe("10px 0");
  });

  it("preserves a site update to a shifted control when refitting", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The updated control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    prev.style.translate = "10px 0";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    const fit = fitInControlBar(anchor, button);
    expect(prev.style.getPropertyValue("translate")).toBe(
      "calc(10px - 41.2px) 0",
    );

    prev.style.translate = "20px 0";
    fit.refit();

    expect(prev.style.getPropertyValue("translate")).toBe(
      "calc(20px - 41.2px) 0",
    );
    fit.dispose();
    expect(prev.style.getPropertyValue("translate")).toBe("20px 0");
  });

  it("copies the anchor offsets onto an absolutely positioned button", () => {
    document.body.innerHTML = `
      <div class="bar" style="position: relative">
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || anchor === null) {
      throw new Error("The offset anchor fixture is incomplete");
    }
    anchor.style.position = "absolute";
    anchor.style.top = "4px";
    anchor.style.right = "20px";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("absolute");
    expect(button.style.getPropertyValue("top")).toBe("4px");
    expect(button.style.getPropertyValue("right")).toBe("20px");

    fit.dispose();
    expect(button.style.getPropertyValue("position")).toBe("");
    expect(button.style.getPropertyValue("top")).toBe("");
    expect(button.style.getPropertyValue("right")).toBe("");
    expect(button.style.getPropertyValue("translate")).toBe("");
  });

  it("retains the anchor's content-box sizing instead of forcing border-box", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.boxSizing = "content-box";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("box-sizing")).toBe("content-box");

    fit.dispose();
    expect(button.style.getPropertyValue("box-sizing")).toBe("");
  });

  it("converts an outer control size to content-box minima", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.boxSizing = "content-box";
    anchor.style.padding = "4px 6px";
    anchor.style.border = "2px solid transparent";
    const button = document.createElement("button");
    button.style.padding = "4px 6px";
    button.style.border = "2px solid transparent";
    bar.insertBefore(button, anchor);
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 40, 40),
    });

    const fit = fitInControlBar(anchor, button);

    // The 40 px outer box already includes 12 px horizontal and 8 px vertical
    // padding plus 4 px of borders on each axis.
    expect(button.style.getPropertyValue("min-width")).toBe("24px");
    expect(button.style.getPropertyValue("min-height")).toBe("28px");

    fit.dispose();
    expect(button.style.getPropertyValue("min-width")).toBe("");
    expect(button.style.getPropertyValue("min-height")).toBe("");
  });

  it("keeps outer minima for a border-box control of any aspect ratio", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.boxSizing = "border-box";
    anchor.style.padding = "4px 6px";
    anchor.style.border = "2px solid transparent";
    const button = document.createElement("button");
    button.style.boxSizing = "border-box";
    bar.insertBefore(button, anchor);
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 40, 20),
    });

    fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("min-width")).toBe("40px");
    expect(button.style.getPropertyValue("min-height")).toBe("20px");
  });

  it("matches the clone's position to an absolutely positioned anchor", () => {
    document.body.innerHTML = `
      <div class="bar" style="position: relative">
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || anchor === null) {
      throw new Error("The positioned anchor fixture is incomplete");
    }
    anchor.style.position = "absolute";
    anchor.style.top = "4px";
    anchor.style.right = "20px";
    // A shared class rule leaves the clone in the flow even though the ID rule
    // positions the native control absolutely.
    const button = document.createElement("button");
    button.style.position = "relative";
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("absolute");
    expect(button.style.getPropertyValue("top")).toBe("4px");
    expect(button.style.getPropertyValue("right")).toBe("20px");

    fit.dispose();
    expect(button.style.getPropertyValue("position")).toBe("relative");
    expect(button.style.getPropertyValue("top")).toBe("");
    expect(button.style.getPropertyValue("right")).toBe("");
  });

  it("matches the clone's position to a relatively positioned anchor", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.position = "relative";
    anchor.style.top = "4px";
    anchor.style.right = "20px";
    // A shared class can leave the clone absolutely positioned even though
    // the anchor's own rule keeps it in flow.
    const button = document.createElement("button");
    button.style.position = "absolute";
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("relative");
    expect(button.style.getPropertyValue("top")).toBe("4px");
    expect(button.style.getPropertyValue("right")).toBe("20px");

    fit.dispose();
    expect(button.style.getPropertyValue("position")).toBe("absolute");
    expect(button.style.getPropertyValue("top")).toBe("");
    expect(button.style.getPropertyValue("right")).toBe("");
  });

  it("matches the clone's position and insets to a sticky anchor", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.position = "sticky";
    anchor.style.top = "6px";
    anchor.style.bottom = "auto";
    const button = document.createElement("button");
    button.style.position = "static";
    button.style.bottom = "12px";
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("sticky");
    expect(button.style.getPropertyValue("top")).toBe("6px");
    expect(button.style.getPropertyValue("bottom")).toBe("auto");

    fit.dispose();
    expect(button.style.getPropertyValue("position")).toBe("static");
    expect(button.style.getPropertyValue("top")).toBe("");
    expect(button.style.getPropertyValue("bottom")).toBe("12px");
  });

  it("sizes the icon from the anchor's rendered icon", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.textContent = "";
    const anchorIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    anchor.append(anchorIcon);
    Object.defineProperty(anchorIcon, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 32, 32),
    });
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    button.append(icon);
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(icon.style.getPropertyValue("width")).toBe("32px");
    expect(icon.style.getPropertyValue("height")).toBe("32px");
    expect(getComputedStyle(button).fontSize).toBe(
      getComputedStyle(anchor).fontSize,
    );

    fit.dispose();
    expect(icon.style.getPropertyValue("width")).toBe("");
    expect(icon.style.getPropertyValue("height")).toBe("");
  });

  it("undoes a scaled control bar when sizing the cloned icon", () => {
    const { bar, anchor } = mountAnchor("display: flex; transform: scale(0.5)");
    anchor.textContent = "";
    const anchorIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    anchor.append(anchorIcon);
    Object.defineProperty(anchorIcon, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 16, 16),
    });
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    button.append(icon);
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    // 16 screen px at scale(.5) is a 32 px CSS icon in the clone.
    expect(icon.style.getPropertyValue("width")).toBe("32px");
    expect(icon.style.getPropertyValue("height")).toBe("32px");
  });

  it("accounts for the cloned icon's own transform when sizing it", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.textContent = "";
    const anchorIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    anchorIcon.style.transform = "scale(0.5)";
    anchor.append(anchorIcon);
    Object.defineProperty(anchorIcon, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 18, 18),
    });
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.style.transform = "scale(0.5)";
    button.append(icon);
    bar.insertBefore(button, anchor);

    fitInControlBar(anchor, button);

    // 18 screen px on a half-scaled icon is a 36 px CSS icon in the clone.
    expect(icon.style.getPropertyValue("width")).toBe("36px");
    expect(icon.style.getPropertyValue("height")).toBe("36px");
  });

  it("undoes a rotated anchor when copying its box dimensions", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.style.transform = "rotate(90deg)";
    anchor.style.boxSizing = "border-box";
    const button = document.createElement("button");
    button.style.transform = "rotate(90deg)";
    button.style.boxSizing = "border-box";
    bar.insertBefore(button, anchor);
    // A 40x20 local box rotated by 90 degrees occupies a 20x40 bounding box.
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 20, 40),
    });

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("min-width")).toBe("40px");
    expect(button.style.getPropertyValue("min-height")).toBe("20px");

    fit.dispose();
    expect(button.style.getPropertyValue("min-width")).toBe("");
    expect(button.style.getPropertyValue("min-height")).toBe("");
  });

  it("falls back to neighbouring icons for a pseudo-element control", () => {
    document.body.innerHTML = `
      <div class="bar" style="display: flex">
        <button class="prev"><svg></svg></button>
        <button class="prev"><svg></svg></button>
        <button class="anchor" aria-label="全屏"></button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || anchor === null) {
      throw new Error("The pseudo-element fixture is incomplete");
    }
    for (const prevIcon of bar.querySelectorAll<SVGElement>(".prev svg")) {
      Object.defineProperty(prevIcon, "getBoundingClientRect", {
        configurable: true,
        value: (): DOMRect => new DOMRect(0, 0, 20, 20),
      });
    }
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 40, 40),
    });
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    button.append(icon);
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    // The 40 px control box is not a 40 px glyph, so the sibling median wins.
    expect(icon.style.getPropertyValue("width")).toBe("20px");
    expect(icon.style.getPropertyValue("height")).toBe("20px");
    fit.dispose();
  });

  it("does not treat an icon-named button as its own glyph", () => {
    document.body.innerHTML = `
      <div class="bar" style="display: flex">
        <button class="prev"><svg></svg></button>
        <button class="prev"><svg></svg></button>
        <button class="anchor icon-button" aria-label="全屏"></button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || anchor === null) {
      throw new Error("The icon-named button fixture is incomplete");
    }
    for (const prevIcon of bar.querySelectorAll<SVGElement>(".prev svg")) {
      Object.defineProperty(prevIcon, "getBoundingClientRect", {
        configurable: true,
        value: (): DOMRect => new DOMRect(0, 0, 20, 20),
      });
    }
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, 40, 40),
    });
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    button.append(icon);
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    // The 40 px button is a control container, not a 40 px glyph.
    expect(icon.style.getPropertyValue("width")).toBe("20px");
    expect(icon.style.getPropertyValue("height")).toBe("20px");
    fit.dispose();
  });

  it("uses the median size of neighbouring control icons", () => {
    document.body.innerHTML = `
      <div class="bar" style="display: flex">
        <button class="prev"><svg></svg></button>
        <button class="prev"><svg></svg></button>
        <button class="prev"><svg></svg></button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || anchor === null) {
      throw new Error("The icon median fixture is incomplete");
    }
    const sizes = [20, 24, 40];
    const icons = [...bar.querySelectorAll<SVGElement>(".prev svg")];
    icons.forEach((icon, index) => {
      const size = sizes[index];
      if (size === undefined) throw new Error("The icon fixture is incomplete");
      Object.defineProperty(icon, "getBoundingClientRect", {
        configurable: true,
        value: (): DOMRect => new DOMRect(0, 0, size, size),
      });
    });
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    button.append(icon);
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);

    expect(icon.style.getPropertyValue("width")).toBe("24px");
    expect(icon.style.getPropertyValue("height")).toBe("24px");
    fit.dispose();
  });

  it("refits the icon when controls change size without moving the anchor", () => {
    const { bar, anchor } = mountAnchor("display: flex");
    anchor.textContent = "";
    const anchorIcon = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    anchor.append(anchorIcon);
    let iconSize = 24;
    Object.defineProperty(anchorIcon, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, iconSize, iconSize),
    });
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    button.append(icon);
    bar.insertBefore(button, anchor);

    const fit = fitInControlBar(anchor, button);
    expect(icon.style.getPropertyValue("width")).toBe("24px");

    iconSize = 40;
    fit.sync();

    expect(icon.style.getPropertyValue("width")).toBe("40px");
    expect(icon.style.getPropertyValue("height")).toBe("40px");
  });

  it("clears inherited class insets when the anchor overrides them to auto", () => {
    document.body.innerHTML = `
      <style>
        .control-btn { position: absolute; top: 8px; right: 12px; }
        #native-fs { top: auto; bottom: 20px; right: 20px; }
      </style>
      <div class="player" style="position: relative">
        <video></video>
        <div class="bar" style="position: relative">
          <button id="native-fs" class="control-btn" aria-label="全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const anchor = document.querySelector<HTMLButtonElement>("#native-fs");
    if (video === null || anchor === null) {
      throw new Error("The overridden inset fixture is incomplete");
    }
    stubVideoRect(video);
    const match = findPlayerMatch(video);
    const button = createFullscreenButton(match);
    expect(insertBeforeFullscreen(match, button)).toBe(true);

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("");
    expect(button.style.getPropertyValue("top")).toBe("auto");
    expect(button.style.getPropertyValue("bottom")).toBe("20px");
    expect(button.style.getPropertyValue("right")).toBe("20px");
    expect(button.style.getPropertyValue("left")).toBe("");
    expect(getComputedStyle(button).top).toBe("auto");
    expect(getComputedStyle(button).bottom).toBe("20px");
    expect(getComputedStyle(button).right).toBe("20px");
    expect(getComputedStyle(button).left).toBe("auto");

    fit.dispose();
    expect(button.style.getPropertyValue("top")).toBe("");
    expect(button.style.getPropertyValue("bottom")).toBe("");
    expect(button.style.getPropertyValue("right")).toBe("");
    expect(button.style.getPropertyValue("left")).toBe("");
  });

  it("refits the absolute cluster when the anchor's layout box changes", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The resized control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    let anchorLeft = 540;
    Object.defineProperty(anchor, "offsetLeft", {
      configurable: true,
      get: (): number => anchorLeft,
    });
    Object.defineProperty(anchor, "offsetWidth", {
      configurable: true,
      value: 40,
    });
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(anchorLeft, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(anchorLeft, 0, 40, 20),
    });

    const fit = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-41.2px 0");

    // A breakpoint moves the anchor and enlarges its icon.
    anchorLeft = 580;
    anchor.style.fontSize = "32px";
    fit.sync();

    expect(button.style.getPropertyValue("translate")).toBe("-51.2px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-12.4px 0");

    fit.dispose();
    expect(prev.style.getPropertyValue("translate")).toBe("");
  });

  it("scales the absolute shift by the element's transform", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The transformed control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    prev.style.transform = "scale(0.5)";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    fitInControlBar(anchor, button);

    // 41.2 screen px at scale(.5) needs an 82.4 px local translation.
    expect(prev.style.getPropertyValue("translate")).toBe("-82.4px 0");
  });

  it("includes an individual scale when converting the shift", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The scaled control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    prev.style.scale = "0.5";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    fitInControlBar(anchor, button);

    expect(prev.style.getPropertyValue("translate")).toBe("-82.4px 0");
  });

  it("includes ancestor transforms when converting the shift", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The transformed player fixture is incomplete");
    }
    bar.style.transform = "scale(0.5)";
    anchor.style.position = "absolute";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    fitInControlBar(anchor, button);

    // Both the button and the preceding control live inside the scaled bar.
    expect(button.style.getPropertyValue("translate")).toBe("-91.2px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-82.4px 0");
  });

  it("keeps the shift horizontal when a preceding control is rotated", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The rotated control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    prev.style.transform = "rotate(90deg)";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    fitInControlBar(anchor, button);

    // A local X translation of a 90-degree rotation would move the control
    // vertically, so the horizontal shift goes through its local Y axis.
    expect(prev.style.getPropertyValue("translate")).toBe("0px 41.2px");
  });

  it("includes an individual rotation when converting the shift", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The rotated longhand fixture is incomplete");
    }
    anchor.style.position = "absolute";
    prev.style.rotate = "90deg";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    fitInControlBar(anchor, button);

    expect(prev.style.getPropertyValue("translate")).toBe("0px 41.2px");
  });

  it("shifts a preceding SVG control with the rest of the cluster", () => {
    document.body.innerHTML = `
      <div class="bar">
        <svg class="prev" width="40" height="20"></svg>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<SVGElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The SVG control bar fixture is incomplete");
    }
    anchor.style.position = "absolute";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(490, 0, 40, 20),
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    const fit = fitInControlBar(anchor, button);

    expect(prev.style.getPropertyValue("translate")).toBe("-41.2px 0");

    fit.dispose();
    expect(prev.style.getPropertyValue("translate")).toBe("");
  });

  it("refits sibling shifts when a preceding control changes without moving the anchor", () => {
    document.body.innerHTML = `
      <div class="bar">
        <button class="prev">prev</button>
        <button class="anchor" aria-label="全屏">全屏</button>
      </div>
    `;
    const bar = document.querySelector<HTMLElement>(".bar");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLButtonElement>(".anchor");
    if (bar === null || prev === null || anchor === null) {
      throw new Error("The sibling refit fixture is incomplete");
    }
    anchor.style.position = "absolute";
    const button = document.createElement("button");
    bar.insertBefore(button, anchor);

    Object.defineProperty(anchor, "offsetLeft", {
      configurable: true,
      value: 540,
    });
    Object.defineProperty(anchor, "offsetWidth", {
      configurable: true,
      value: 40,
    });
    let prevRect = new DOMRect(0, 0, 0, 0);
    Object.defineProperty(prev, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => prevRect,
    });
    Object.defineProperty(anchor, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });
    Object.defineProperty(button, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(540, 0, 40, 20),
    });

    const fit = fitInControlBar(anchor, button);
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("");

    prevRect = new DOMRect(490, 0, 40, 20);
    fit.sync();

    expect(prev.style.getPropertyValue("translate")).toBe("-41.2px 0");

    fit.dispose();
    expect(prev.style.getPropertyValue("translate")).toBe("");
  });
});

describe("userscript metadata", () => {
  it("declares an inline SVG icon", () => {
    const icon = meta.icon;
    if (icon === undefined) throw new Error("The userscript icon is missing");
    expect(icon.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decodeURIComponent(icon.slice("data:image/svg+xml,".length));
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 64 64"');
  });
});

describe("web fullscreen controller", () => {
  it("applies viewport styles and restores every inline value on exit", () => {
    document.body.innerHTML = `
      <div class="outer" style="transform: translateX(12px); z-index: 2">
        <div class="player" style="position: absolute; width: 320px; height: 180px">
          <video style="width: 100%; height: 100%; object-fit: cover"></video>
        </div>
      </div>
    `;
    const outer = document.querySelector<HTMLElement>(".outer");
    const player = document.querySelector<HTMLElement>(".player");
    const video = document.querySelector<HTMLVideoElement>("video");
    if (outer === null || player === null || video === null) {
      throw new Error("The controller fixture is incomplete");
    }

    const controller = createWebFullscreenController(document);
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(
      controller.toggle({ video, player, mode: "custom" }),
    ).toBe(true);
    expect(controller.isActiveFor(video)).toBe(true);
    expect(player.style.getPropertyValue("position")).toBe("fixed");
    expect(player.style.getPropertyValue("width")).toBe("100vw");
    expect(player.style.getPropertyValue("height")).toBe("100vh");
    expect(video.style.getPropertyValue("object-fit")).toBe("contain");
    expect(outer.style.getPropertyValue("transform")).toBe("none");
    expect(outer.style.getPropertyValue("z-index")).toBe("auto");
    expect(document.documentElement.style.getPropertyValue("overflow-x")).toBe("hidden");
    expect(document.documentElement.style.getPropertyValue("overflow-y")).toBe("hidden");
    expect(document.body.style.getPropertyValue("overflow-x")).toBe("hidden");
    expect(document.body.style.getPropertyValue("overflow-y")).toBe("hidden");
    expect(listener).toHaveBeenLastCalledWith(video);

    expect(controller.toggle({ video, player, mode: "custom" })).toBe(false);
    expect(controller.isActiveFor(video)).toBe(false);
    expect(player.style.getPropertyValue("position")).toBe("absolute");
    expect(player.style.getPropertyValue("width")).toBe("320px");
    expect(video.style.getPropertyValue("object-fit")).toBe("cover");
    expect(outer.style.getPropertyValue("transform")).toBe("translateX(12px)");
    expect(outer.style.getPropertyValue("z-index")).toBe("2");
    expect(document.documentElement.style.getPropertyValue("overflow-x")).toBe("");
    expect(document.documentElement.style.getPropertyValue("overflow-y")).toBe("");
    expect(document.body.style.getPropertyValue("overflow-x")).toBe("");
    expect(document.body.style.getPropertyValue("overflow-y")).toBe("");
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("leaves inline longhands untouched after a round trip", () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 320px; height: 180px; margin-top: 8px; padding-left: 12px; border-top-width: 3px; border-top-style: solid; border-top-left-radius: 6px">
        <video></video>
      </div>
    `;
    const player = document.querySelector<HTMLElement>(".player");
    const video = document.querySelector<HTMLVideoElement>("video");
    if (player === null || video === null) {
      throw new Error("The longhand fixture is incomplete");
    }
    const snapshot = (): string[] =>
      [...player.style]
        .map(
          (name) =>
            `${name}:${player.style.getPropertyValue(name)}:${player.style.getPropertyPriority(name)}`,
        )
        .sort();
    const original = snapshot();

    const controller = createWebFullscreenController(document);
    controller.toggle({ video, player, mode: "custom" });
    controller.exit();

    expect(snapshot()).toEqual(original);
    expect(player.style.getPropertyValue("margin-top")).toBe("8px");
    expect(player.style.getPropertyValue("padding-left")).toBe("12px");
    expect(player.style.getPropertyValue("border-top-width")).toBe("3px");
    expect(player.style.getPropertyValue("border-top-left-radius")).toBe("6px");
    expect(player.style.getPropertyValue("cursor")).toBe("");
  });

  it("exits on Escape", () => {
    const { video, player } = mountCustomPlayer();
    const controller = createWebFullscreenController(document);
    controller.toggle({ video, player, mode: "custom" });

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(controller.isActiveFor(video)).toBe(false);
    expect(player.style.getPropertyValue("position")).toBe("absolute");
  });

  it("promotes a native video itself to the viewport", () => {
    document.body.innerHTML = '<video controls></video>';
    const video = document.querySelector<HTMLVideoElement>("video");
    if (video === null) throw new Error("The video fixture is missing");
    const controller = createWebFullscreenController(document);
    controller.toggle({ video, player: video, mode: "native" });

    expect(video.style.getPropertyValue("position")).toBe("fixed");
    expect(video.style.getPropertyValue("width")).toBe("100vw");
    controller.exit();
    expect(video.style.getPropertyValue("position")).toBe("");
  });
});

describe("iframe bridge", () => {
  it("promotes the source iframe and restores it on exit", () => {
    document.body.innerHTML = '<iframe title="Embedded player"></iframe>';
    const frame = document.querySelector<HTMLIFrameElement>("iframe");
    const source = frame?.contentWindow;
    if (frame === null || source === null) throw new Error("The iframe fixture is missing");

    const onParentExit = vi.fn();
    const cleanup = installFrameBridge(document, {
      scrollLock: createScrollLock(document),
      onParentExit,
    });
    cleanups.push(cleanup);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: FRAME_CHANNEL, action: "enter" },
        source: source as unknown as MessageEventSource,
        origin: "https://child.example",
      }),
    );
    expect(frame.style.getPropertyValue("position")).toBe("fixed");
    expect(frame.style.getPropertyValue("width")).toBe("100vw");
    expect(document.body.style.getPropertyValue("overflow-x")).toBe("hidden");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: FRAME_CHANNEL, action: "exit" },
        source: source as unknown as MessageEventSource,
        origin: "https://child.example",
      }),
    );
    expect(frame.style.getPropertyValue("position")).toBe("");
    expect(document.body.style.getPropertyValue("overflow-x")).toBe("");

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { channel: FRAME_CHANNEL, action: "exit" },
        source: window.parent,
        origin: "https://parent.example",
      }),
    );
    expect(onParentExit).toHaveBeenCalledTimes(1);
  });
});

describe("installation", () => {
  it("waits for the first player interaction before injecting", async () => {
    const { player } = mountCustomPlayer();
    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);

    expect(player.querySelector(`[${BUTTON_ATTRIBUTE}]`)).toBeNull();

    player.dispatchEvent(new Event("pointerover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(player.querySelector(`[${BUTTON_ATTRIBUTE}]`)).not.toBeNull();
  });

  it("also injects after keyboard focus reaches the player", async () => {
    const { player } = mountCustomPlayer();
    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);

    player.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(player.querySelector(`[${BUTTON_ATTRIBUTE}]`)).not.toBeNull();
  });

  it("does not inject when a lazy native web-fullscreen control appears first", async () => {
    const { player } = mountCustomPlayer();
    const controls = player.querySelector<HTMLElement>(".player-controls");
    if (controls === null) throw new Error("The control bar is missing");
    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);

    player.dispatchEvent(new Event("pointerover", { bubbles: true }));
    controls.insertAdjacentHTML(
      "afterbegin",
      '<button aria-label="网页全屏">网页全屏</button>',
    );
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(player.querySelector(`[${BUTTON_ATTRIBUTE}]`)).toBeNull();
  });

  it("moves a floating fallback into the bar once lazy controls render", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
      </div>
    `;
    const player = document.querySelector<HTMLElement>(".player");
    const video = document.querySelector<HTMLVideoElement>("video");
    if (player === null || video === null) {
      throw new Error("The lazy player fixture is incomplete");
    }
    stubVideoRect(video);
    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);

    expect(
      document.querySelector(`.${FLOATING_BUTTON_CLASS}`),
    ).not.toBeNull();

    player.insertAdjacentHTML(
      "beforeend",
      '<div class="player-controls"><button aria-label="进入全屏">全屏</button></div>',
    );
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(document.querySelector(`.${FLOATING_BUTTON_CLASS}`)).toBeNull();
    expect(player.querySelector(`[${BUTTON_ATTRIBUTE}]`)).not.toBeNull();
  });

  it("rescans when a class change makes an existing control recognizable", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls">
          <button id="late-anchor"></button>
        </div>
      </div>
    `;
    const player = document.querySelector<HTMLElement>(".player");
    const video = document.querySelector<HTMLVideoElement>("video");
    const anchor = document.querySelector<HTMLButtonElement>("#late-anchor");
    if (player === null || video === null || anchor === null) {
      throw new Error("The class-change fixture is incomplete");
    }
    stubVideoRect(video);
    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);

    // Without a label or a fullscreen hint the control is not detectable yet,
    // so the native video keeps the floating fallback.
    expect(findPlayerMatch(video).mode).toBe("native");
    expect(document.querySelector(`.${FLOATING_BUTTON_CLASS}`)).not.toBeNull();

    anchor.classList.add("fullscreen-btn");
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(findPlayerMatch(video).mode).toBe("custom");
    expect(document.querySelector(`.${FLOATING_BUTTON_CLASS}`)).toBeNull();
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The bar button was not inserted");
    expect(button.nextElementSibling).toBe(anchor);
  });

  it("inserts our button before the native control and toggles the viewport", async () => {
    const { player, anchor } = mountCustomPlayer();
    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);

    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.nextElementSibling).toBe(anchor);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(player.style.getPropertyValue("position")).toBe("fixed");
    expect(button.getAttribute("aria-pressed")).toBe("true");

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(player.style.getPropertyValue("position")).toBe("absolute");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("uses a floating fallback for a native video", () => {
    document.body.innerHTML = '<video controls></video>';
    const video = document.querySelector<HTMLVideoElement>("video");
    if (video === null) throw new Error("The video fixture is missing");
    Object.defineProperty(video, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect =>
        video.style.getPropertyValue("position") === "fixed"
          ? new DOMRect(0, 0, window.innerWidth, window.innerHeight)
          : new DOMRect(0, 0, 640, 360),
    });

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    const button = document.querySelector<HTMLButtonElement>(".yoko-web-fullscreen-floating");
    if (button === null) throw new Error("The floating button was not inserted");
    expect(button.style.getPropertyValue("right")).toBe(
      `${window.innerWidth - 640 + 52}px`,
    );

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(video.style.getPropertyValue("position")).toBe("fixed");
    expect(button.style.getPropertyValue("right")).toBe("52px");
    expect(button.style.getPropertyValue("bottom")).toBe("8px");

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(video.style.getPropertyValue("position")).toBe("");
    expect(button.style.getPropertyValue("right")).toBe(
      `${window.innerWidth - 640 + 52}px`,
    );
  });

  it("fits an absolute control bar and restores shifted controls on teardown", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="position: absolute; width: 640px; height: 360px">
          <button class="prev" style="position: absolute; right: 84px" aria-label="字幕">字幕</button>
          <button id="native-fullscreen" style="position: absolute; right: 20px" aria-label="进入全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const controls = document.querySelector<HTMLElement>(".player-controls");
    const prev = document.querySelector<HTMLElement>(".prev");
    const anchor = document.querySelector<HTMLElement>("#native-fullscreen");
    if (
      video === null ||
      player === null ||
      controls === null ||
      prev === null ||
      anchor === null
    ) {
      throw new Error("The absolute player fixture is incomplete");
    }
    const rects = new Map<Element, DOMRect>([
      [video, new DOMRect(0, 0, 640, 360)],
      [player, new DOMRect(0, 0, 640, 360)],
      [controls, new DOMRect(0, 0, 640, 360)],
      [prev, new DOMRect(520, 0, 40, 20)],
      [anchor, new DOMRect(560, 0, 40, 20)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element): DOMRect {
        const rect = rects.get(this);
        if (rect !== undefined) return rect;
        if (this.hasAttribute(BUTTON_ATTRIBUTE)) {
          return new DOMRect(560, 0, 40, 20);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-51.2px 0");

    cleanup();
    expect(prev.style.getPropertyValue("translate")).toBe("");
  });

  it("refits an absolute control bar when the player resizes", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="position: absolute; width: 640px; height: 360px">
          <button class="prev" style="position: absolute; right: 84px" aria-label="字幕">字幕</button>
          <button id="native-fullscreen" style="position: absolute; right: 20px" aria-label="进入全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const controls = document.querySelector<HTMLElement>(".player-controls");
    const prev = document.querySelector<HTMLElement>(".prev");
    const anchor = document.querySelector<HTMLElement>("#native-fullscreen");
    if (
      video === null ||
      player === null ||
      controls === null ||
      prev === null ||
      anchor === null
    ) {
      throw new Error("The resized player fixture is incomplete");
    }
    let anchorLeft = 560;
    Object.defineProperty(anchor, "offsetLeft", {
      configurable: true,
      get: (): number => anchorLeft,
    });
    Object.defineProperty(anchor, "offsetWidth", {
      configurable: true,
      value: 40,
    });
    const rects = new Map<Element, DOMRect>([
      [video, new DOMRect(0, 0, 640, 360)],
      [player, new DOMRect(0, 0, 640, 360)],
      [controls, new DOMRect(0, 0, 640, 360)],
      [prev, new DOMRect(520, 0, 40, 20)],
      [anchor, new DOMRect(anchorLeft, 0, 40, 20)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element): DOMRect {
        const rect = rects.get(this);
        if (rect !== undefined) return rect;
        if (this.hasAttribute(BUTTON_ATTRIBUTE)) {
          return new DOMRect(anchorLeft, 0, 40, 20);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");

    anchorLeft = 580;
    anchor.style.fontSize = "32px";
    rects.set(anchor, new DOMRect(anchorLeft, 0, 40, 20));
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(button.style.getPropertyValue("translate")).toBe("-51.2px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-42.4px 0");
  });

  it("refits an absolute control bar when the anchor's style changes", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="position: absolute; width: 640px; height: 360px">
          <button class="prev" style="position: absolute; right: 84px" aria-label="字幕">字幕</button>
          <button id="native-fullscreen" style="position: absolute; right: 20px" aria-label="进入全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const controls = document.querySelector<HTMLElement>(".player-controls");
    const prev = document.querySelector<HTMLElement>(".prev");
    const anchor = document.querySelector<HTMLElement>("#native-fullscreen");
    if (
      video === null ||
      player === null ||
      controls === null ||
      prev === null ||
      anchor === null
    ) {
      throw new Error("The restyled player fixture is incomplete");
    }
    let anchorLeft = 560;
    Object.defineProperty(anchor, "offsetLeft", {
      configurable: true,
      get: (): number => anchorLeft,
    });
    Object.defineProperty(anchor, "offsetWidth", {
      configurable: true,
      value: 40,
    });
    const rects = new Map<Element, DOMRect>([
      [video, new DOMRect(0, 0, 640, 360)],
      [player, new DOMRect(0, 0, 640, 360)],
      [controls, new DOMRect(0, 0, 640, 360)],
      [prev, new DOMRect(520, 0, 40, 20)],
      [anchor, new DOMRect(anchorLeft, 0, 40, 20)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element): DOMRect {
        const rect = rects.get(this);
        if (rect !== undefined) return rect;
        if (this.hasAttribute(BUTTON_ATTRIBUTE)) {
          return new DOMRect(anchorLeft, 0, 40, 20);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");

    // Let the insertion-triggered scan settle so the assertion below exercises
    // the attribute observer rather than a pending child-list scan.
    await new Promise((resolve) => setTimeout(resolve, 220));
    // A player class toggle restyles the anchor through its inline style
    // without resizing the video or firing a window resize event.
    anchorLeft = 580;
    anchor.style.fontSize = "32px";
    rects.set(anchor, new DOMRect(anchorLeft, 0, 40, 20));
    await new Promise((resolve) => setTimeout(resolve, 260));

    expect(button.style.getPropertyValue("translate")).toBe("-51.2px 0");
  });

  it("refits the injected icon when an observed control icon resizes", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="display: flex">
          <button id="native-fullscreen" aria-label="全屏"><svg></svg></button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const anchor = document.querySelector<HTMLButtonElement>("#native-fullscreen");
    const anchorIcon = document.querySelector<SVGElement>("#native-fullscreen svg");
    if (video === null || player === null || anchor === null || anchorIcon === null) {
      throw new Error("The observed icon fixture is incomplete");
    }
    stubVideoRect(video);
    let iconSize = 24;
    Object.defineProperty(anchorIcon, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, iconSize, iconSize),
    });

    const observers: {
      readonly callback: ResizeObserverCallback;
      readonly targets: Set<Element>;
    }[] = [];
    class FakeResizeObserver {
      readonly targets = new Set<Element>();

      constructor(readonly callback: ResizeObserverCallback) {
        observers.push(this);
      }

      observe(target: Element): void {
        this.targets.add(target);
      }

      unobserve(target: Element): void {
        this.targets.delete(target);
      }

      disconnect(): void {
        this.targets.clear();
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const injectedIcon = player.querySelector<SVGElement>(
      `[${BUTTON_ATTRIBUTE}] svg`,
    );
    const observer = observers[0];
    if (injectedIcon === null || observer === undefined) {
      throw new Error("The injected icon or resize observer is missing");
    }
    expect(injectedIcon.style.getPropertyValue("width")).toBe("24px");
    expect(observer.targets.has(anchorIcon)).toBe(true);

    // A font swap or hover rule can resize the source icon with no window,
    // video, or DOM mutation to trigger a scan.
    iconSize = 40;
    observer.callback([], observer as unknown as ResizeObserver);
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(injectedIcon.style.getPropertyValue("width")).toBe("40px");
    expect(injectedIcon.style.getPropertyValue("height")).toBe("40px");
  });

  it("refits when hover changes only transformed bounds", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="display: flex">
          <button class="prev"><svg></svg></button>
          <button id="native-fullscreen" aria-label="全屏"><svg></svg></button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const anchor = document.querySelector<HTMLButtonElement>("#native-fullscreen");
    const anchorIcon = document.querySelector<SVGElement>("#native-fullscreen svg");
    if (video === null || player === null || anchor === null || anchorIcon === null) {
      throw new Error("The hover transform fixture is incomplete");
    }
    stubVideoRect(video);
    let iconSize = 24;
    Object.defineProperty(anchorIcon, "getBoundingClientRect", {
      configurable: true,
      value: (): DOMRect => new DOMRect(0, 0, iconSize, iconSize),
    });

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const injectedIcon = player.querySelector<SVGElement>(
      `[${BUTTON_ATTRIBUTE}] svg`,
    );
    if (injectedIcon === null) {
      throw new Error("The injected icon is missing");
    }
    expect(injectedIcon.style.getPropertyValue("width")).toBe("24px");

    // A :hover rule that only scales the icon changes the rendered box but
    // neither the layout box nor any class/style attribute.
    iconSize = 48;
    anchorIcon.dispatchEvent(
      new PointerEvent("pointerover", { bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(injectedIcon.style.getPropertyValue("width")).toBe("48px");
    expect(injectedIcon.style.getPropertyValue("height")).toBe("48px");

    iconSize = 24;
    anchorIcon.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 220));

    expect(injectedIcon.style.getPropertyValue("width")).toBe("24px");
    expect(injectedIcon.style.getPropertyValue("height")).toBe("24px");
  });

  it("refits when a preceding control becomes visible", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="position: absolute; width: 640px; height: 360px">
          <button class="prev is-hidden" style="position: absolute; right: 84px" aria-label="字幕">字幕</button>
          <button id="native-fullscreen" style="position: absolute; right: 20px" aria-label="进入全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const controls = document.querySelector<HTMLElement>(".player-controls");
    const prev = document.querySelector<HTMLElement>(".prev");
    const anchor = document.querySelector<HTMLElement>("#native-fullscreen");
    if (
      video === null ||
      player === null ||
      controls === null ||
      prev === null ||
      anchor === null
    ) {
      throw new Error("The hidden control fixture is incomplete");
    }
    const rects = new Map<Element, DOMRect>([
      [video, new DOMRect(0, 0, 640, 360)],
      [player, new DOMRect(0, 0, 640, 360)],
      [controls, new DOMRect(0, 0, 640, 360)],
      [anchor, new DOMRect(560, 0, 40, 20)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element): DOMRect {
        const rect = rects.get(this);
        if (rect !== undefined) return rect;
        if (this === prev) {
          return prev.classList.contains("is-hidden")
            ? new DOMRect(0, 0, 0, 0)
            : new DOMRect(520, 0, 40, 20);
        }
        if (this.hasAttribute(BUTTON_ATTRIBUTE)) {
          return new DOMRect(560, 0, 40, 20);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("");

    // Let the insertion-triggered scan settle before revealing the control.
    await new Promise((resolve) => setTimeout(resolve, 220));
    prev.classList.remove("is-hidden");
    await new Promise((resolve) => setTimeout(resolve, 260));

    expect(prev.style.getPropertyValue("translate")).toBe("-51.2px 0");
  });

  it("refits when a preceding control toggles the hidden attribute", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="position: absolute; width: 640px; height: 360px">
          <button class="prev" hidden style="position: absolute; right: 84px" aria-label="字幕">字幕</button>
          <button id="native-fullscreen" style="position: absolute; right: 20px" aria-label="进入全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const controls = document.querySelector<HTMLElement>(".player-controls");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLElement>("#native-fullscreen");
    if (
      video === null ||
      player === null ||
      controls === null ||
      prev === null ||
      anchor === null
    ) {
      throw new Error("The hidden attribute fixture is incomplete");
    }
    const rects = new Map<Element, DOMRect>([
      [video, new DOMRect(0, 0, 640, 360)],
      [player, new DOMRect(0, 0, 640, 360)],
      [controls, new DOMRect(0, 0, 640, 360)],
      [anchor, new DOMRect(560, 0, 40, 20)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element): DOMRect {
        const rect = rects.get(this);
        if (rect !== undefined) return rect;
        if (this === prev) {
          return prev.hidden
            ? new DOMRect(0, 0, 0, 0)
            : new DOMRect(520, 0, 40, 20);
        }
        if (this.hasAttribute(BUTTON_ATTRIBUTE)) {
          return new DOMRect(560, 0, 40, 20);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("");

    await new Promise((resolve) => setTimeout(resolve, 220));
    prev.hidden = false;
    await new Promise((resolve) => setTimeout(resolve, 260));

    expect(prev.style.getPropertyValue("translate")).toBe("-51.2px 0");
  });

  it("refits preceding controls on resize when a CSS breakpoint keeps the anchor fixed", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="position: absolute; width: 640px; height: 360px">
          <button class="prev" style="position: absolute; right: 84px" aria-label="字幕">字幕</button>
          <button id="native-fullscreen" style="position: absolute; right: 20px" aria-label="进入全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const controls = document.querySelector<HTMLElement>(".player-controls");
    const prev = document.querySelector<HTMLButtonElement>(".prev");
    const anchor = document.querySelector<HTMLElement>("#native-fullscreen");
    if (
      video === null ||
      player === null ||
      controls === null ||
      prev === null ||
      anchor === null
    ) {
      throw new Error("The breakpoint control bar fixture is incomplete");
    }
    Object.defineProperty(anchor, "offsetLeft", {
      configurable: true,
      value: 560,
    });
    Object.defineProperty(anchor, "offsetWidth", {
      configurable: true,
      value: 40,
    });
    let prevRect = new DOMRect(0, 0, 0, 0);
    const rects = new Map<Element, DOMRect>([
      [video, new DOMRect(0, 0, 640, 360)],
      [player, new DOMRect(0, 0, 640, 360)],
      [controls, new DOMRect(0, 0, 640, 360)],
      [anchor, new DOMRect(560, 0, 40, 20)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element): DOMRect {
        const rect = rects.get(this);
        if (rect !== undefined) return rect;
        if (this === prev) return prevRect;
        if (this.hasAttribute(BUTTON_ATTRIBUTE)) {
          return new DOMRect(560, 0, 40, 20);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("");

    prevRect = new DOMRect(520, 0, 40, 20);
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(prev.style.getPropertyValue("translate")).toBe("-51.2px 0");
  });

  it("recreates the control bar fit when the anchor is replaced", async () => {
    document.body.innerHTML = `
      <div class="player" style="position: absolute; width: 640px; height: 360px">
        <video style="width: 100%; height: 100%"></video>
        <div class="player-controls" style="position: absolute; width: 640px; height: 360px">
          <button class="prev" style="position: absolute; right: 84px" aria-label="字幕">字幕</button>
          <button id="native-fullscreen" style="position: absolute; right: 20px" aria-label="进入全屏">全屏</button>
        </div>
      </div>
    `;
    const video = document.querySelector<HTMLVideoElement>("video");
    const player = document.querySelector<HTMLElement>(".player");
    const controls = document.querySelector<HTMLElement>(".player-controls");
    const prev = document.querySelector<HTMLElement>(".prev");
    const anchor = document.querySelector<HTMLElement>("#native-fullscreen");
    if (
      video === null ||
      player === null ||
      controls === null ||
      prev === null ||
      anchor === null
    ) {
      throw new Error("The replaceable player fixture is incomplete");
    }
    let anchorLeft = 560;
    const rects = new Map<Element, DOMRect>([
      [video, new DOMRect(0, 0, 640, 360)],
      [player, new DOMRect(0, 0, 640, 360)],
      [controls, new DOMRect(0, 0, 640, 360)],
      [prev, new DOMRect(520, 0, 40, 20)],
      [anchor, new DOMRect(anchorLeft, 0, 40, 20)],
    ]);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element): DOMRect {
        const rect = rects.get(this);
        if (rect !== undefined) return rect;
        if (this.hasAttribute(BUTTON_ATTRIBUTE)) {
          return new DOMRect(anchorLeft, 0, 40, 20);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );

    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);
    await activatePlayer(player);
    const oldButton = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (oldButton === null) throw new Error("The web fullscreen button was not inserted");
    expect(oldButton.style.getPropertyValue("translate")).toBe("-45.6px 0");

    const replacement = anchor.cloneNode(true) as HTMLElement;
    anchorLeft = 580;
    rects.set(replacement, new DOMRect(anchorLeft, 0, 40, 20));
    anchor.replaceWith(replacement);
    await new Promise((resolve) => setTimeout(resolve, 220));

    const button = replacement.previousElementSibling;
    expect(button).not.toBe(oldButton);
    expect(button?.hasAttribute(BUTTON_ATTRIBUTE)).toBe(true);
    expect(button?.getAttribute("style")).toContain("-45.6px 0");
    expect(oldButton.isConnected).toBe(false);
  });
});
