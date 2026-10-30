// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeDom } from "../shared/dom/observeDom";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("observeDom", () => {
  it("returns null when the selector matches nothing", () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    expect(observeDom("#missing", () => undefined)).toBeNull();
    expect(observe).not.toHaveBeenCalled();
  });

  it("observes the matched node and disconnects idempotently", () => {
    const panel = document.createElement("div");
    panel.id = "panel";
    document.body.append(panel);
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    const callback = vi.fn<MutationCallback>();

    const observation = observeDom("#panel", callback);
    expect(observation).not.toBeNull();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe.mock.calls[0]?.[0]).toBe(panel);
    expect(observe.mock.calls[0]?.[1]).toEqual({ childList: true, subtree: true });
    expect(observation?.active).toBe(true);

    observation?.disconnect();
    observation?.disconnect();
    expect(observation?.active).toBe(false);
  });

  it("reports mutations until disconnected", async () => {
    const panel = document.createElement("div");
    panel.id = "panel";
    document.body.append(panel);
    const callback = vi.fn<MutationCallback>();
    const observation = observeDom("#panel", callback);

    panel.append(document.createElement("span"));
    await new Promise<void>((resolve) => {
      queueMicrotask(() => {
        resolve();
      });
    });
    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled();
    });

    observation?.disconnect();
    callback.mockClear();
    panel.append(document.createElement("b"));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it("honours an explicit target, config, and observer factory", () => {
    const target = document.createElement("section");
    const query = vi.spyOn(document, "querySelector");
    const factory = vi.fn((observed: Node, observedConfig: MutationObserverInit) => {
      expect(observed).toBe(target);
      expect(observedConfig).toBe(config);
      return { disconnect: () => undefined, active: false };
    });
    const config: MutationObserverInit = { attributes: true };

    const observation = observeDom("#ignored", () => undefined, { target, config, observe: factory });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
    expect(observation?.active).toBe(false);
  });
});

