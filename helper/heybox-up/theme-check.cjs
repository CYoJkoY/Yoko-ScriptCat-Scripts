const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "../../scripts/heybox-up.js"), "utf8");
const start = "// ==theme-core:start==";
const end = "// ==theme-core:end==";
const from = source.indexOf(start);
const to = source.indexOf(end);
assert.ok(from >= 0 && to > from, "theme core markers missing");

const core = source.slice(from + start.length, to);
const theme = new Function(core + "\nreturn { THEME_PRESETS, THEME_IDS, normalizeThemeMode, resolveTheme };" )();

assert.deepStrictEqual(theme.THEME_IDS, ["system", "dark", "oled", "light", "paper", "mist"]);
assert.strictEqual(theme.normalizeThemeMode(null), "system");
assert.strictEqual(theme.normalizeThemeMode("unknown"), "system");
for (const id of theme.THEME_IDS) assert.strictEqual(theme.normalizeThemeMode(id), id);

assert.strictEqual(theme.resolveTheme("system", true), "dark");
assert.strictEqual(theme.resolveTheme("system", false), "light");
assert.strictEqual(theme.resolveTheme("paper", true), "paper");
assert.strictEqual(theme.resolveTheme("oled", false), "oled");

const flags = Object.fromEntries(theme.THEME_PRESETS.map((preset) => [preset.id, preset.dark]));
assert.deepStrictEqual(flags, { system: null, dark: true, oled: true, light: false, paper: false, mist: false });

console.log("theme-check ok");
