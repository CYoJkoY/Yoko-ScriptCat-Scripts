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
        window.GM_registerMenuCommand = (label, callback) => {
          if (label.includes("打开")) window.openPort = callback;
          if (label.includes("快捷键")) window.configureHotkey = callback;
        };
        window.GM_openInTab = (url) => { window.openedUrl = url; };
        window.unsafeWindow = window;
      }, structuredClone(store));
      await target.addScriptTag({ content: source });
    }
    async function waitForStore(predicate, label) {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("等待存储超时：" + label);
    }
    function seedCard(id, card) {
      store["port:v1:card:" + id] = {
        name: card.name, url: card.url, checkinUrl: card.checkinUrl ?? card.url, tags: card.tags ?? [],
        icon: card.icon ?? "server", notes: card.notes ?? "", script: card.script ?? "", enabled: card.enabled ?? false,
      };
      return id;
    }
    function seedJob(token, job) { store["port:v1:job:" + token] = job; }
    async function openTaskTab(url, token, prepare) {
      const tab = await context.newPage();
      const target = new URL(url);
      target.searchParams.set("__port_task", token);
      await tab.goto(target.href);
      if (prepare !== undefined) await prepare(tab);
      await inject(tab);
      return tab;
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
    // 普通 HTTP 页面缺少 crypto.randomUUID，任务与卡片键回退到 getRandomValues。
    const insecure = await context.newPage();
    await insecure.goto("http://insecure.example/");
    assert.equal(await insecure.evaluate(() => typeof crypto.randomUUID), "undefined", "普通 HTTP 页面不应存在 crypto.randomUUID");
    assert.equal(await insecure.evaluate(() => typeof crypto.getRandomValues), "function", "普通 HTTP 页面仍应有 crypto.getRandomValues");
    await inject(insecure);
    await insecure.evaluate(() => window.openPort());
    const insecureRoot = insecure.locator("#port-manager");
    await insecureRoot.getByRole("button", { name: "+ 新增中转站", exact: true }).click();
    const insecureForm = insecureRoot.locator("#editor");
    await insecureForm.getByLabel("名称", { exact: true }).fill("HttpOnly");
    await insecureForm.getByLabel("站点网址", { exact: true }).fill("http://insecure.example/");
    await insecureForm.getByLabel("签到 JavaScript", { exact: true }).fill('return "签到成功";');
    await insecureForm.getByRole("checkbox").check();
    await insecureForm.getByRole("button", { name: "保存卡片" }).click();
    const insecureCard = insecureRoot.locator("article").filter({ hasText: "HttpOnly" });
    await insecureCard.getByRole("button", { name: "签到", exact: true }).click();
    const insecureToken = new URL(await insecure.evaluate(() => window.openedUrl)).searchParams.get("__port_task");
    assert.match(insecureToken, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "回退 ID 应为 UUID v4");
    assert.ok(Object.hasOwn(store, "port:v1:job:" + insecureToken), "缺少 randomUUID 时仍须创建任务");
    assert.match(await insecureCard.locator(".status").textContent(), /等待目标页执行/);
    delete store["port:v1:job:" + insecureToken];
    await insecure.close();

    // 打开目标页失败时清理任务并写回失败结果，不停留在「等待执行」。
    seedCard("blocked", { name: "BlockedOpen", url: "https://blocked.example/", script: 'return "ok";', enabled: true });
    const blocked = await context.newPage();
    await blocked.goto("https://blocked.example/");
    await inject(blocked);
    await blocked.evaluate(() => { window.openPort(); window.GM_openInTab = () => { throw new Error("被拦截"); }; });
    const blockedRoot = blocked.locator("#port-manager");
    const jobsBefore = Object.keys(store).filter((key) => key.startsWith("port:v1:job:")).length;
    await blockedRoot.locator("article").filter({ hasText: "BlockedOpen" }).getByRole("button", { name: "签到", exact: true }).click();
    await waitForStore(() => store["port:v1:result:blocked"]?.text === "打开签到页失败：被拦截", "打开失败结果");
    assert.equal(Object.keys(store).filter((key) => key.startsWith("port:v1:job:")).length, jobsBefore, "打开失败必须清理任务");
    await blockedRoot.getByRole("button", { name: "刷新", exact: true }).click();
    assert.match(await blockedRoot.locator("article").filter({ hasText: "BlockedOpen" }).locator(".status").textContent(), /打开签到页失败/);
    await blocked.close();

    // 脚本抛错、waitFor 找不到元素与非有限等待毫秒数都写回卡片结果。
    seedCard("fail", { name: "FailScript", url: "https://fail.example/", script: 'throw new Error("boom");', enabled: true });
    seedCard("missing", { name: "MissingSelector", url: "https://missing.example/", script: 'const started = Date.now(); try { await waitFor(".no-such-element", 300); } catch (error) { return error.message + "@" + (Date.now() - started); } return "found";', enabled: true });
    seedCard("badms", { name: "BadWaitArgument", url: "https://badms.example/", script: 'await waitFor("#checkin", "abc"); return "found";', enabled: true });
    async function queueFrom(host, name) {
      const consolePage = await context.newPage();
      await consolePage.goto("https://" + host + "/");
      await inject(consolePage);
      await consolePage.evaluate(() => window.openPort());
      await consolePage.locator("#port-manager").locator("article").filter({ hasText: name }).getByRole("button", { name: "签到", exact: true }).click();
      const token = new URL(await consolePage.evaluate(() => window.openedUrl)).searchParams.get("__port_task");
      await consolePage.close();
      return token;
    }
    const failTab = await openTaskTab("https://fail.example/", await queueFrom("fail.example", "FailScript"));
    await waitForStore(() => store["port:v1:result:fail"]?.text === "执行失败：boom", "脚本抛错结果");
    await failTab.close();
    const missingTab = await openTaskTab("https://missing.example/", await queueFrom("missing.example", "MissingSelector"));
    await waitForStore(() => /^返回：未找到元素：\.no-such-element@\d+$/.test(store["port:v1:result:missing"]?.text ?? ""), "waitFor 超时结果");
    assert.ok(Number(store["port:v1:result:missing"].text.split("@")[1]) >= 250, "waitFor 应等待给定的毫秒数");
    await missingTab.close();
    const badMsTab = await openTaskTab("https://badms.example/", await queueFrom("badms.example", "BadWaitArgument"));
    await waitForStore(() => store["port:v1:result:badms"]?.text === "执行失败：waitFor 的等待毫秒数必须是有限数值", "非有限等待值拒绝");
    await badMsTab.close();

    // 过期、卡片删除、配置变更与无效任务网址都写回取消结果并清理参数与任务。
    const expiredId = seedCard("expired", { name: "ExpiredJob", url: "https://expired.example/", script: 'return "ok";', enabled: true });
    seedJob("expired-token", { id: expiredId, url: "https://expired.example/", createdAt: Date.now() - 6 * 60 * 1000 });
    const expiredTab = await openTaskTab("https://expired.example/", "expired-token");
    await waitForStore(() => store["port:v1:result:" + expiredId]?.text === "已取消：任务已过期（5 分钟内有效）", "过期任务结果");
    assert.equal(Object.hasOwn(store, "port:v1:job:expired-token"), false, "过期任务必须删除");
    assert.equal(new URL(expiredTab.url()).searchParams.has("__port_task"), false, "过期任务必须清理参数");
    await expiredTab.close();
    const changedId = seedCard("changed", { name: "ChangedJob", url: "https://changed.example/", checkinUrl: "https://changed.example/other", script: 'return "ok";', enabled: true });
    seedJob("changed-token", { id: changedId, url: "https://changed.example/", createdAt: Date.now() });
    const changedTab = await openTaskTab("https://changed.example/", "changed-token");
    await waitForStore(() => store["port:v1:result:" + changedId]?.text === "已取消：卡片配置已变更或脚本已禁用", "配置变更结果");
    await changedTab.close();
    seedJob("deleted-token", { id: "no-such-card", url: "https://deleted.example/", createdAt: Date.now() });
    const deletedTab = await openTaskTab("https://deleted.example/", "deleted-token");
    await waitForStore(() => store["port:v1:result:no-such-card"]?.text === "已取消：卡片已删除", "卡片删除结果");
    await deletedTab.close();
    const badUrlId = seedCard("badurl", { name: "BadUrlJob", url: "https://badurl.example/", script: 'return "ok";', enabled: true });
    seedJob("badurl-token", { id: badUrlId, url: "not a url", createdAt: Date.now() });
    const badUrlTab = await openTaskTab("https://badurl.example/", "badurl-token");
    await waitForStore(() => store["port:v1:result:" + badUrlId]?.text === "已取消：任务网址无效", "无效任务网址结果");
    assert.equal(new URL(badUrlTab.url()).searchParams.has("__port_task"), false, "无效任务网址必须清理参数");
    await badUrlTab.close();
    const unknownTab = await context.newPage();
    await unknownTab.goto("https://unknown.example/?__port_task=site-owned");
    await inject(unknownTab);
    assert.equal(new URL(unknownTab.url()).searchParams.get("__port_task"), "site-owned", "未知令牌不得清理站点参数");
    await unknownTab.close();
    const sweepId = seedCard("sweep", { name: "SweepJob", url: "https://sweep.example/", script: 'return "ok";', enabled: true });
    seedJob("sweep-token", { id: sweepId, url: "https://sweep.example/", createdAt: Date.now() - 6 * 60 * 1000 });
    const sweepTab = await context.newPage();
    await sweepTab.goto("https://sweep.example/");
    await inject(sweepTab);
    await waitForStore(() => Object.hasOwn(store, "port:v1:result:" + sweepId), "过期任务清扫结果");
    assert.equal(Object.hasOwn(store, "port:v1:job:sweep-token"), false, "地址栏无关的过期任务也必须清扫");
    await sweepTab.close();

    // 过期清扫不得覆盖更新的终态结果；地址栏清理失败也不得丢失任务结果。
    const keptId = seedCard("kept", { name: "KeptResult", url: "https://kept.example/", script: 'return "ok";', enabled: true });
    seedJob("kept-token", { id: keptId, url: "https://kept.example/", createdAt: Date.now() - 6 * 60 * 1000 });
    store["port:v1:result:" + keptId] = { text: "返回：签到成功", at: Date.now() };
    const keptTab = await context.newPage();
    await keptTab.goto("https://kept.example/");
    await inject(keptTab);
    assert.equal(store["port:v1:result:" + keptId].text, "返回：签到成功", "过期清扫不得覆盖成功结果");
    assert.equal(Object.hasOwn(store, "port:v1:job:kept-token"), false, "过期任务仍须清扫");
    await keptTab.close();
    const resilientId = seedCard("resilient", { name: "ResilientResult", url: "https://resilient.example/", script: 'return "ok";', enabled: true });
    seedJob("resilient-token", { id: resilientId, url: "https://resilient.example/", createdAt: Date.now() - 6 * 60 * 1000 });
    const resilientTab = await openTaskTab("https://resilient.example/", "resilient-token", (tab) => tab.evaluate(() => {
      history.replaceState = () => { throw new Error("地址栏被锁定"); };
    }));
    await waitForStore(() => store["port:v1:result:" + resilientId]?.text === "已取消：任务已过期（5 分钟内有效）", "地址栏清理失败仍写回结果");
    assert.equal(Object.hasOwn(store, "port:v1:job:resilient-token"), false, "地址栏清理失败仍须消费任务");
    await resilientTab.close();

    // 关闭面板停止结果轮询；全部站点与标签按钮具备 aria-pressed。
    seedCard("polled", { name: "Polled", url: "https://poll.example/", tags: ["监控"] });
    const polled = await context.newPage();
    await polled.goto("https://poll.example/");
    await inject(polled);
    await polled.evaluate(() => {
      const original = window.GM_getValue;
      window.resultReads = 0;
      window.GM_getValue = (key, fallback) => { if (String(key).startsWith("port:v1:result:")) window.resultReads += 1; return original(key, fallback); };
    });
    await polled.evaluate(() => window.openPort());
    const polledRoot = polled.locator("#port-manager");
    const allSites = polledRoot.locator("aside").getByRole("button", { name: "全部站点", exact: true });
    assert.equal(await allSites.getAttribute("aria-pressed"), "true");
    await polledRoot.locator("aside").getByRole("button", { name: "监控", exact: true }).click();
    assert.equal(await allSites.getAttribute("aria-pressed"), "false");
    assert.equal(await polledRoot.locator("aside").getByRole("button", { name: "监控", exact: true }).getAttribute("aria-pressed"), "true");
    await polled.waitForTimeout(1800);
    await polledRoot.getByRole("button", { name: "关闭", exact: true }).click();
    const readsAtClose = await polled.evaluate(() => window.resultReads);
    assert.ok(readsAtClose > 0, "面板打开期间应轮询结果");
    await polled.waitForTimeout(2000);
    assert.equal(await polled.evaluate(() => window.resultReads), readsAtClose, "关闭面板后必须停止轮询");

    // 键盘关闭编辑对话框后焦点回到触发按钮。
    await polled.evaluate(() => window.openPort());
    await polledRoot.locator("article").filter({ hasText: "Polled" }).getByRole("button", { name: "编辑" }).click();
    await polled.waitForFunction(() => document.querySelector("#port-manager").shadowRoot.querySelector("#editor").open === true);
    await polled.keyboard.press("Escape");
    await polled.waitForFunction(() => document.querySelector("#port-manager").shadowRoot.querySelector("#editor").open === false);
    assert.equal(await polled.evaluate(() => document.querySelector("#port-manager").shadowRoot.activeElement.textContent), "编辑", "对话框关闭后焦点应回到触发按钮");
    await polledRoot.getByRole("button", { name: "关闭", exact: true }).click();
    await polled.close();

    // 全局快捷键：默认 Ctrl+Alt+P 打开并聚焦搜索；修饰键必须完全匹配；off 与非法配置可预期。
    const hotkeyPage = await context.newPage();
    await hotkeyPage.goto("https://hotkey.example/");
    await inject(hotkeyPage);
    const hotkeyRoot = hotkeyPage.locator("#port-manager");
    const hotkeyDialog = hotkeyRoot.locator("dialog").first();
    await hotkeyPage.keyboard.press("Control+Alt+P");
    await hotkeyDialog.waitFor({ state: "visible" });
    assert.equal(await hotkeyPage.evaluate(() => document.querySelector("#port-manager").shadowRoot.activeElement?.getAttribute("type")), "search", "快捷键打开后应聚焦搜索框");
    await hotkeyPage.keyboard.press("Control+Alt+Shift+P");
    assert.equal(await hotkeyRoot.locator("dialog[open]").count(), 1, "多按 Shift 不应重复打开");
    await hotkeyPage.keyboard.press("Escape");
    await hotkeyPage.waitForFunction(() => document.querySelector("#port-manager").shadowRoot.querySelector("dialog").open === false);
    await hotkeyPage.evaluate(() => window.GM_setValue("port:v1:setting:hotkey", "off"));
    await hotkeyPage.keyboard.press("Control+Alt+P");
    await hotkeyPage.waitForTimeout(200);
    assert.equal(await hotkeyRoot.locator("dialog[open]").count(), 0, "off 后快捷键不得打开面板");
    await hotkeyPage.evaluate(() => window.GM_setValue("port:v1:setting:hotkey", "shift+control+u"));
    await hotkeyPage.keyboard.press("Control+Shift+U");
    await hotkeyDialog.waitFor({ state: "visible" });
    await hotkeyPage.keyboard.press("Escape");
    await hotkeyPage.waitForFunction(() => document.querySelector("#port-manager").shadowRoot.querySelector("dialog").open === false);
    await hotkeyPage.evaluate(() => window.GM_setValue("port:v1:setting:hotkey", "ctrl+ctrl+p"));
    await hotkeyPage.keyboard.press("Control+Alt+P");
    await hotkeyDialog.waitFor({ state: "visible" });
    await hotkeyPage.close();

    // 页面在 window 捕获阶段拦截 keydown（preventDefault + stopPropagation）后，同目标的脚本监听仍应触发。
    const intercepted = await context.newPage();
    await intercepted.goto("https://intercept.example/");
    await intercepted.evaluate(() => {
      window.addEventListener("keydown", (event) => { event.preventDefault(); event.stopPropagation(); }, true);
    });
    await inject(intercepted);
    await intercepted.keyboard.press("Control+Alt+P");
    await intercepted.locator("#port-manager").locator("dialog").first().waitFor({ state: "visible" });
    await intercepted.close();

    // 未命中组合键时必须原样放行，避免脚本吞掉站点自身的键盘操作。
    const passthrough = await context.newPage();
    await passthrough.goto("https://passthrough.example/");
    await passthrough.evaluate(() => {
      window.__portPageKeys = [];
      document.addEventListener("keydown", (event) => {
        if (event.code.startsWith("Key")) window.__portPageKeys.push([event.code, event.defaultPrevented]);
      }, true);
    });
    await inject(passthrough);
    await passthrough.keyboard.press("Control+Alt+K");
    await passthrough.keyboard.press("Control+Alt+P");
    await passthrough.locator("#port-manager").locator("dialog").first().waitFor({ state: "visible" });
    assert.deepEqual(await passthrough.evaluate(() => window.__portPageKeys), [["KeyK", false]], "只有完整命中快捷键才应接管页面键盘事件");
    await passthrough.close();

    // 损坏卡片中断列表并提示具体存储键，避免静默丢弃数据。
    store["port:v1:card:corrupt-demo"] = { name: "", url: "ftp://corrupt.example/" };
    const corrupt = await context.newPage();
    await corrupt.goto("https://corrupt.example/");
    await inject(corrupt);
    await corrupt.evaluate(() => window.openPort());
    assert.match(await corrupt.evaluate(() => document.querySelector("#port-manager").shadowRoot.querySelector("footer").textContent), /存在 1 张损坏的卡片数据：port:v1:card:corrupt-demo/);
    assert.equal(await corrupt.evaluate(() => document.querySelector("#port-manager").shadowRoot.querySelectorAll("article").length), 0);
    await corrupt.close();
    delete store["port:v1:card:corrupt-demo"];
    console.log("Port browser tests passed: CRUD, AND tags, search, upload, shared storage, task origin/replay, import/export, narrow layout, insecure-context id, open failure, script failures, task cleanup, polling, aria-pressed, dialog focus, hotkey, keydown isolation");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
