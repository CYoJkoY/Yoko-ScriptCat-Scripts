// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("HeyBox Up theme menu keyboard contract", () => {
  let theme: typeof import("../scripts/heybox-up/src/ui/theme");

  beforeAll(async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => true,
      }),
    });
    window.history.replaceState({}, "", "/app/bbs/home");
    theme = await import("../scripts/heybox-up/src/ui/theme");
  });

  beforeEach(() => {
    theme.releaseTheme();
    theme.createThemeEntry();
    const host = theme.themeEntry?.host;
    if (host === undefined) throw new Error("Expected theme entry host");
    document.body.append(host);
  });

  function press(key: string, shiftKey = false): void {
    const target = theme.themeEntry?.host.shadowRoot?.activeElement ?? document;
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, key, shiftKey }));
  }

  it("moves focus to the selected theme item and cycles with arrow keys", () => {
    const entry = theme.themeEntry;
    if (entry === null) throw new Error("Expected theme entry");
    entry.button.click();
    const shadow = entry.host.shadowRoot;
    if (shadow === null) throw new Error("Expected theme shadow root");
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("system");

    press("ArrowDown");
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("dark");
    press("ArrowUp");
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("system");
    press("ArrowUp");
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("mist");
  });

  it("supports Home and End in the theme menu", () => {
    const entry = theme.themeEntry;
    if (entry === null) throw new Error("Expected theme entry");
    entry.button.click();
    const shadow = entry.host.shadowRoot;
    if (shadow === null) throw new Error("Expected theme shadow root");

    press("End");
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("mist");
    press("Home");
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("system");
  });

  it("keeps Tab traversal inside the open menu", () => {
    const entry = theme.themeEntry;
    if (entry === null) throw new Error("Expected theme entry");
    entry.button.click();
    const shadow = entry.host.shadowRoot;
    if (shadow === null) throw new Error("Expected theme shadow root");

    press("Tab");
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("dark");
    press("Tab", true);
    expect(shadow.activeElement?.getAttribute("data-theme")).toBe("system");
  });

  it("enters the settings menu at its first menu item and tabs through inputs", () => {
    const entry = theme.themeEntry;
    if (entry === null) throw new Error("Expected theme entry");
    entry.settingsButton.click();
    const shadow = entry.host.shadowRoot;
    if (shadow === null) throw new Error("Expected theme shadow root");
    const firstItem = entry.settingsMenu.querySelector<HTMLElement>('[role^="menuitem"]');
    if (firstItem === null) throw new Error("Expected a settings menu item");
    expect(shadow.activeElement).toBe(firstItem);

    const menuItems = entry.settingsMenu.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    menuItems[5]?.focus();
    expect(shadow.activeElement?.getAttribute("role")).toMatch(/^menuitem/);
    expect(shadow.activeElement?.tagName).toBe("BUTTON");
    press("ArrowDown");
    expect(shadow.activeElement?.getAttribute("role")).toMatch(/^menuitem/);

    const historyInput = entry.settingsMenu.querySelector<HTMLInputElement>('input[aria-label="阅读时间轴最多保留的帖子数量"]');
    const lineHeightInput = entry.settingsMenu.querySelector<HTMLInputElement>('input[aria-label="正文行距倍数"]');
    const feedWidthInput = entry.settingsMenu.querySelector<HTMLInputElement>('input[aria-label="自定义中栏宽度百分比"]');
    if (historyInput === null || lineHeightInput === null || feedWidthInput === null) throw new Error("Expected settings inputs");
    menuItems[5]?.focus();
    press("Tab");
    expect(shadow.activeElement).toBe(historyInput);
    press("Tab");
    expect(shadow.activeElement).toBe(lineHeightInput);
    const chips = Array.from(entry.settingsMenu.querySelectorAll<HTMLButtonElement>(".chip"));
    for (const chip of chips) {
      press("Tab");
      expect(shadow.activeElement).toBe(chip);
    }
    press("Tab");
    expect(shadow.activeElement).toBe(feedWidthInput);
    press("Tab", true);
    expect(shadow.activeElement).toBe(chips[chips.length - 1]);
  });

  it("returns focus to the matching trigger when Escape closes a menu", () => {
    const entry = theme.themeEntry;
    if (entry === null) throw new Error("Expected theme entry");
    entry.button.click();
    press("Escape");
    expect(entry.menu.hidden).toBe(true);
    expect(entry.host.shadowRoot?.activeElement).toBe(entry.button);

    entry.settingsButton.click();
    press("Escape");
    expect(entry.settingsMenu.hidden).toBe(true);
    expect(entry.host.shadowRoot?.activeElement).toBe(entry.settingsButton);
  });

  it("keeps mouse selection behavior and restores the theme trigger focus", () => {
    const entry = theme.themeEntry;
    if (entry === null) throw new Error("Expected theme entry");
    entry.button.click();
    const dark = entry.items.find((item) => item.id === "dark");
    if (dark === undefined) throw new Error("Expected dark theme item");
    dark.node.click();
    expect(theme.currentThemeMode).toBe("dark");
    expect(entry.menu.hidden).toBe(true);
    expect(entry.host.shadowRoot?.activeElement).toBe(entry.button);
  });
});
