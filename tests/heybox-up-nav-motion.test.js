import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../scripts/heybox-up.js", import.meta.url), "utf8");
const navCssStart = source.indexOf("const NAV_CSS = `");
const navCssEnd = source.indexOf("\n  `;", navCssStart);
assert.ok(navCssStart >= 0 && navCssEnd > navCssStart, "navigation CSS must exist");
const navCss = source.slice(navCssStart, navCssEnd);

test("navigation icons animate on pointer, keyboard, and press interactions", () => {
  for (const icon of ["home", "community", "favour", "article"]) {
    const selector = new RegExp(
      "\\.hbu-nav-link:hover \\.hbu-ico-" + icon
        + "[^\\n]*:focus-visible \\.hbu-ico-" + icon
        + "[^\\n]*animation: hbu-nav-" + icon,
    );
    assert.match(navCss, selector, icon + " icon must animate for each input state");
    assert.match(
      navCss,
      new RegExp("\\.hbu-nav-link:active \\.hbu-ico-" + icon + "[^\\n]*animation: hbu-nav-press"),
      icon + " icon must use a distinct press animation",
    );
  }
  assert.match(navCss, /@keyframes hbu-nav-press/);
  assert.doesNotMatch(navCss, /\.hbu-nav-link\.is-active \.hbu-ico-/, "current page state must not consume the animation");
});

test("navigation motion preference and reduced-motion support remain in place", () => {
  assert.match(navCss, /NAV_STATIC_CLASS[^\n]*animation: none !important/);
  assert.match(navCss, /prefers-reduced-motion: reduce[\s\S]*?animation: none !important/);
  assert.match(source, /localStore\.write\(NAV_MOTION_KEY, value \? "1" : "0"\)/);
  assert.match(source, /NAV_MOTION_EVENT[^\n]*applyNavMotionPreference/);
});
