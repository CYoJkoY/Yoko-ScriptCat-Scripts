const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PORT_PLAYWRIGHT_MODULE || "playwright");
const source = fs.readFileSync(path.join(__dirname, "../scripts/port.js"), "utf8").replace(
  'attachShadow({ mode: "closed" })', 'attachShadow({ mode: "open" })',
);

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const store = {};
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><button id=checkin>签到</button></body></html>" }));
    await context.exposeBinding("persist", (event, key, value) => {
      if (value === null) delete store[key]; else store[key] = value;
    });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.accept());
    async function inject(target) {
      await target.evaluate((saved) => {
        window.portStore = saved;
        window.GM_getValue = (key, fallback) => Object.hasOwn(portStore, key) ? portStore[key] : fallback;
        window.GM_setValue = (key, value) => { portStore[key] = value; window.persist(key, value); };
        window.GM_deleteValue = (key) => { delete portStore[key]; window.persist(key, null); };
        window.GM_listValues = () => Object.keys(portStore);
        window.GM_registerMenuCommand = (label, callback) => { window.openPort = callback; };
        window.GM_openInTab = (url) => { window.openedUrl = url; };
        window.unsafeWindow = window;
      }, structuredClone(store));
      await target.addScriptTag({ content: source });
    }
    await page.goto("https://dashboard.example/"); await inject(page);
    await page.evaluate(() => window.openPort());
    const root = page.locator("#port-manager");
    async function add(name, url, tags, script = "") {
      await root.getByRole("button", { name: "+ 新增中转站", exact: true }).click();
      const form = root.locator("#editor");
      await form.getByLabel("名称", { exact: true }).fill(name);
      await form.getByLabel("站点网址", { exact: true }).fill(url);
      await form.getByLabel("标签（逗号分隔）", { exact: true }).fill(tags);
      await form.getByLabel("签到 JavaScript", { exact: true }).fill(script);
      if (script !== "") await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: "保存卡片" }).click();
    }
    await add("Alpha", "https://alpha.example/", "常用, Claude", 'window.checkinCount = (window.checkinCount ?? 0) + 1; return "签到成功";');
    await add("Beta", "https://beta.example/", "常用, GPT");
    await add("Gamma", "https://gamma.example/", "Claude");
    assert.equal(await root.locator("article").count(), 3);
    await root.locator("aside").getByRole("button", { name: "常用", exact: true }).click();
    assert.equal(await root.locator("article").count(), 2);
    await root.locator("aside").getByRole("button", { name: "Claude", exact: true }).click();
    assert.equal(await root.locator("article").count(), 1);
    assert.equal(await root.locator("article h2").textContent(), "Alpha");
    await root.getByRole("searchbox").fill("missing");
    assert.equal(await root.locator("article").count(), 0);
    await root.getByRole("searchbox").fill("");
    await root.locator("article").getByRole("button", { name: "编辑" }).click();
    await root.locator("#editor").getByLabel("备注", { exact: true }).fill("自定义备注 <script>alert(1)</script>");
    await root.locator("#editor").getByLabel("或上传图片（最大 250KB）").setInputFiles({ name: "icon.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2kAAAAASUVORK5CYII=", "base64") });
    await root.getByRole("button", { name: "保存卡片" }).click();
    assert.equal((await root.locator("article img").getAttribute("src")).startsWith("data:image/png;base64,"), true);
    assert.match(await root.locator("article .notes").textContent(), /<script>/);
    await root.locator("article").getByRole("button", { name: "签到", exact: true }).click();
    const targetUrl = await page.evaluate(() => window.openedUrl);
    assert.equal(new URL(targetUrl).origin, "https://alpha.example");
    const taskKey = Object.keys(store).find((key) => key.startsWith("port:v1:job:"));
    assert.ok(taskKey);
    const wrong = await context.newPage();
    await wrong.goto(targetUrl.replace("alpha.example", "wrong.example")); await inject(wrong);
    assert.equal(await wrong.evaluate(() => window.checkinCount), undefined);
    assert.ok(Object.hasOwn(store, taskKey), "wrong origin must not consume task");
    await wrong.close();
    const runner = await context.newPage();
    await runner.goto(targetUrl); await inject(runner);
    await runner.waitForFunction(() => window.checkinCount === 1);
    await runner.waitForFunction(() => Object.values(portStore).some((value) => value?.text === "返回：签到成功"));
    assert.equal(new URL(runner.url()).searchParams.has("__port_task"), false);
    assert.equal(Object.hasOwn(store, taskKey), false);
    await runner.goto(targetUrl); await inject(runner);
    assert.equal(await runner.evaluate(() => window.checkinCount), undefined, "task must not replay");
    await runner.evaluate(() => window.openPort());
    assert.equal(await runner.locator("#port-manager article").count(), 3, "GM data shared across origins");
    await runner.close();

    const downloadPromise = page.waitForEvent("download");
    await root.getByRole("button", { name: "导出", exact: true }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.equal(exported.cards.length, 3);
    assert.equal(exported.cards.find((card) => card.name === "Alpha").enabled, true);
    await root.locator('input[accept=".json,application/json"]').setInputFiles({ name: "port.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
    await page.waitForFunction(() => Object.keys(portStore).filter((key) => key.startsWith("port:v1:card:")).length === 6);
    const alphas = Object.values(await page.evaluate(() => portStore)).filter((card) => card?.name === "Alpha");
    assert.equal(alphas.filter((card) => card.enabled === false).length, 1);
    await root.locator('input[accept=".json,application/json"]').setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ format: "port", version: 1, cards: [{ name: "bad", url: "javascript:alert(1)" }] })) });
    await page.waitForFunction(() => document.querySelector("#port-manager").shadowRoot.querySelector("footer").textContent.startsWith("导入失败"));
    assert.equal(Object.keys(store).filter((key) => key.startsWith("port:v1:card:")).length, 6);
    await root.locator("aside").getByRole("button", { name: "全部站点", exact: true }).click();
    await root.locator("article").first().getByRole("button", { name: "编辑" }).click();
    await root.getByRole("button", { name: "删除此卡片" }).click();
    assert.equal(await root.locator("article").count(), 5);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await root.locator("dialog").first().evaluate((element) => element.scrollWidth <= element.clientWidth), true);
    const output = process.env.PORT_SCREENSHOT;
    if (output !== undefined) await page.screenshot({ path: output });
    await root.getByRole("button", { name: "关闭", exact: true }).click();
    assert.equal(await root.locator("dialog").first().evaluate((element) => element.open), false);
    console.log("Port browser tests passed: CRUD, AND tags, search, upload, shared storage, task origin/replay, import/export, narrow layout");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
