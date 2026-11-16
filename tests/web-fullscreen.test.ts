// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUTTON_ATTRIBUTE, FRAME_CHANNEL } from "../scripts/web-fullscreen/src/config";
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
});

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

    const cleanup = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("absolute");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-51.2px 0");

    cleanup();
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

    const cleanup = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe(
      "calc(10px - 41.2px) 0",
    );

    cleanup();
    expect(prev.style.getPropertyValue("translate")).toBe("10px 0");
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

    const cleanup = fitInControlBar(anchor, button);

    expect(button.style.getPropertyValue("position")).toBe("absolute");
    expect(button.style.getPropertyValue("top")).toBe("4px");
    expect(button.style.getPropertyValue("right")).toBe("20px");

    cleanup();
    expect(button.style.getPropertyValue("position")).toBe("");
    expect(button.style.getPropertyValue("top")).toBe("");
    expect(button.style.getPropertyValue("right")).toBe("");
    expect(button.style.getPropertyValue("translate")).toBe("");
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
  it("inserts our button before the native control and toggles the viewport", () => {
    const { player, anchor } = mountCustomPlayer();
    const cleanup = installWebFullscreen(document);
    cleanups.push(cleanup);

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

  it("fits an absolute control bar and restores shifted controls on teardown", () => {
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
    const button = player.querySelector<HTMLElement>(`[${BUTTON_ATTRIBUTE}]`);
    if (button === null) throw new Error("The web fullscreen button was not inserted");
    expect(button.style.getPropertyValue("translate")).toBe("-45.6px 0");
    expect(prev.style.getPropertyValue("translate")).toBe("-51.2px 0");

    cleanup();
    expect(prev.style.getPropertyValue("translate")).toBe("");
  });
});
