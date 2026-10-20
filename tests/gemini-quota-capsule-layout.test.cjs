#!/usr/bin/env node
// Gemini Quota Capsule 布局回归：验证切换指示器形态时胶囊宽度（长边）恒定。
//
// 运行方式（PowerShell）：
//   $env:GQC_PLAYWRIGHT_MODULE='<本机 playwright 模块目录>'
//   node tests/gemini-quota-capsule-layout.test.cjs
// 缺少 Playwright 时失败，避免把未执行的浏览器验证误报为通过。

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const SCRIPT_PATH = path.join(__dirname, "..", "scripts", "gemini-quota-capsule.js");
// 与脚本内 INDICATOR_MODES 保持同序；脚本新增形态时这里必须同步，否则断言会失败。
const MODE_KEYS = ["bar", "ring", "disk", "decay", "segments", "battery", "columns"];
// 「已用」百分比样本：边界 0、中段 42、满载 100，覆盖文本位数变化与颜色阈值。
const USED_SAMPLES = [0, 42, 100];
// 两段进度槽位的固定宽度（px），切到非横条形态时应保留同样的布局空间。
const TRACK_WIDTH_PX = 24;

// 按候选顺序尝试加载 Playwright；返回 null 表示环境未提供，调用方应跳过。
function loadPlaywright() {
  const candidates = [];
  if (process.env.GQC_PLAYWRIGHT_MODULE) {
    candidates.push(process.env.GQC_PLAYWRIGHT_MODULE);
  }
  candidates.push("playwright");
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  return null;
}

// 依次尝试浏览器通道，返回首个能成功启动的 browser 实例。
async function launchBrowser(chromium) {
  const requested = process.env.GQC_BROWSER_CHANNEL;
  const channels = requested ? [requested] : ["msedge", "chromium"];
  const errors = [];
  for (const entry of channels) {
    try {
      const options = { headless: true };
      if (entry !== "chromium") {
        options.channel = entry;
      }
      return await chromium.launch(options);
    } catch (error) {
      errors.push(`${entry}: ${error.message}`);
    }
  }
  throw new Error(`无法启动浏览器：${errors.join("; ")}`);
}

// 横条 / 分段 / 电池三种形态真实占位；其余形态只隐藏槽位。
const INLINE_MODE_KEYS = ["bar", "segments", "battery"];

// 在页面内灌入固定状态并逐个切换形态，回传每种形态下的宽度测量值。
function collectMeasurements(usedSamples) {
  const samples = [];
  for (const used of usedSamples) {
    for (const kind of ["fiveHour", "weekly"]) {
      Object.assign(window.__gqc.state[kind], {
        pct: 100 - used,
        usedPct: used,
        resetAt: Date.now() + 3600 * 1000,
        updatedAt: Date.now(),
      });
    }
    // 第二个图标按钮是设置抽屉开关（第一个是刷新）。
    const iconButtons = document.querySelectorAll(".gc-btn-icon");
    iconButtons[iconButtons.length - 1].click();
    for (const button of document.querySelectorAll(".gc-choice-btn")) {
      button.click();
      const pill = document.querySelector(".gc-pill-container");
      samples.push({
        used,
        mode: button.dataset.style,
        width: pill.getBoundingClientRect().width,
        tracks: [...document.querySelectorAll(".gc-inline-track")].map(
          (node) => node.getBoundingClientRect().width,
        ),
        trackVisibility: [...document.querySelectorAll(".gc-inline-track")].map(
          (node) => node.style.visibility,
        ),
        headChildren: document.querySelector(".gc-capsule-head").childElementCount,
      });
    }
  }
  return samples;
}

async function main() {
  const playwright = loadPlaywright();
  if (playwright === null) {
    throw new Error("未找到 Playwright，请设置 GQC_PLAYWRIGHT_MODULE 指向本机安装。");
  }

  const originalSource = fs.readFileSync(SCRIPT_PATH, "utf8");
  // 只建 DOM、不做网络同步，避免测试依赖真实 Gemini 页面与登录态。
  const source = originalSource.replace("  bootstrap();", "  createDOM();");
  assert.notEqual(source, originalSource, "未找到 bootstrap() 调用，脚本入口结构可能已变化");

  const browser = await launchBrowser(playwright.chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("https://gemini.google.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
    );
    await page.goto("https://gemini.google.com/app");
    await page.addScriptTag({ content: source });
    const samples = await page.evaluate(collectMeasurements, USED_SAMPLES);

    assert.equal(
      samples.length,
      USED_SAMPLES.length * MODE_KEYS.length,
      `测量条数不符：${JSON.stringify(samples)}`,
    );
    const observedModes = [...new Set(samples.map((row) => row.mode))].sort();
    assert.deepEqual(observedModes, [...MODE_KEYS].sort(), `形态清单不符：${observedModes.join(",")}`);

    // 胶囊宽度必须在所有形态 × 所有用量下完全一致。
    const widths = [...new Set(samples.map((row) => row.width))];
    assert.equal(widths.length, 1, `胶囊宽度发生了跳动：${JSON.stringify(samples)}`);

    for (const row of samples) {
      assert.equal(row.tracks.length, 2, `进度槽位数量不符：${JSON.stringify(row)}`);
      for (const width of row.tracks) {
        assert.equal(width, TRACK_WIDTH_PX, `槽位宽度被改动：${JSON.stringify(row)}`);
      }
      // 徽章内始终只画一个图形，切换形态时不残留上一个形态的节点。
      assert.equal(row.headChildren, 1, `徽章图形节点数不符：${JSON.stringify(row)}`);
      const expectedVisibility = INLINE_MODE_KEYS.includes(row.mode) ? "visible" : "hidden";
      for (const visibility of row.trackVisibility) {
        assert.equal(
          visibility,
          expectedVisibility,
          `槽位显隐不符（${row.mode}）：${JSON.stringify(row)}`,
        );
      }
    }

    // 检验真实的每秒更新入口；不向产品新增测试专用公共 API。
    const tickSource = originalSource.replace("  bootstrap();",
      "  window.__testUpdateUI = updateUI;");
    await page.reload();
    await page.addScriptTag({ content: tickSource.replace(
      "  window.__testUpdateUI = updateUI;",
      "  createDOM(); window.__testUpdateUI = updateUI;") });
    const audit = await page.evaluate((modes) => {
      const rows = [];
      for (const mode of modes) {
        window.__gqc.config.styleMode = mode;
        Object.assign(window.__gqc.state.fiveHour, { pct: 80, usedPct: 20, resetAt: null });
        Object.assign(window.__gqc.state.weekly, { pct: 10, usedPct: 90, resetAt: null });
        window.__testUpdateUI();
        const head = document.querySelector(".gc-capsule-head");
        const firstGraphic = head.firstElementChild;
        const beforeCount = document.querySelectorAll("#gc-pill-root *").length;
        const observer = new MutationObserver(() => {});
        observer.observe(head, { childList: true, subtree: true, attributes: true });
        const started = performance.now();
        for (let index = 0; index < 1000; index += 1) window.__testUpdateUI();
        const duration = performance.now() - started;
        const mutations = observer.takeRecords().length;
        observer.disconnect();
        const stable = head.firstElementChild === firstGraphic;
        const countStable = beforeCount === document.querySelectorAll("#gc-pill-root *").length;
        const columns = mode === "columns"
          ? [...head.querySelectorAll("rect")].map((rect) => Number(rect.getAttribute("height")))
          : null;
        window.__gqc.state.weekly.usedPct = 0;
        window.__testUpdateUI();
        const changed = head.firstElementChild !== firstGraphic;
        rows.push({ mode, duration, mutations, stable, countStable, changed, columns });
      }
      return rows;
    }, MODE_KEYS);
    for (const row of audit) {
      assert.equal(row.mutations, 0, `静态图形重复写入：${JSON.stringify(row)}`);
      assert.equal(row.stable, true, `静态图形被重建：${row.mode}`);
      assert.equal(row.countStable, true, `节点数增长：${row.mode}`);
      assert.equal(row.changed, true, `用量变化未重新渲染：${row.mode}`);
      if (row.columns !== null) assert.deepEqual(row.columns, [14, 2.8, 14, 12.6]);
    }
    const states = await page.evaluate(() => {
      const result = [];
      const scenarios = [
        { pct: null, usedPct: null, resetAt: null, rawResetText: "", expected: "待同步" },
        { pct: 0, usedPct: 100, resetAt: null, rawResetText: "", expected: "已用尽" },
        { pct: 58, usedPct: 42, resetAt: Date.now() + 3600000, rawResetText: "", expected: null },
        { pct: 58, usedPct: 42, resetAt: Date.now() - 1, rawResetText: "", expected: "待同步" },
      ];
      for (const scenario of scenarios) {
        Object.assign(window.__gqc.state.fiveHour, scenario);
        window.__gqc.state.lastSyncTime = Date.now();
        window.__testUpdateUI();
        const group = document.querySelector(".gc-metric-group");
        result.push({ text: group.querySelector(".gc-pill-timer").textContent,
          percent: group.querySelector(".gc-pill-counter").textContent,
          width: document.querySelector(".gc-pill-container").getBoundingClientRect().width,
          expected: scenario.expected });
      }
      window.__gqc.state.isSyncing = true;
      window.__testUpdateUI();
      result.push({ text: document.querySelector(".gc-pill-timer").textContent,
        spinning: document.querySelector(".gc-btn-icon").classList.contains("gc-spinning") });
      window.__gqc.state.isSyncing = false;
      return result;
    });
    for (const row of states.slice(0, 4)) {
      if (row.expected !== null) assert.equal(row.text, row.expected);
    }
    assert.match(states[2].text, /^\d{2}:\d{2}(?::\d{2})?$/);
    assert.equal(states[3].percent, "--%");
    assert.equal(new Set(states.slice(0, 4).map((row) => row.width)).size, 1);
    assert.equal(states[4].text, "同步中");
    assert.equal(states[4].spinning, true);
    // Enter / Space 均走原生按钮，轮换后保存并在重载时恢复。
    await page.locator(".gc-capsule-head").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => window.__gqc.config.styleMode), "bar");
    await page.keyboard.press("Space");
    assert.equal(await page.evaluate(() => window.__gqc.config.styleMode), "ring");
    await page.reload();
    await page.addScriptTag({ content: source });
    assert.equal(await page.evaluate(() => window.__gqc.config.styleMode), "ring");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const animation = await page.evaluate(() => {
      window.__gqc.config.styleMode = "decay";
      window.__gqc.state.fiveHour.pct = 0;
      window.__gqc.state.fiveHour.usedPct = 100;
      document.querySelector(".gc-capsule-head").click();
      // 点击会切到 segments，再用设置选择 decay 以触发真实交互渲染。
      document.querySelector('.gc-choice-btn[data-style="decay"]').click();
      return getComputedStyle(document.querySelector(".gc-state-critical")).animationName;
    });
    assert.equal(animation, "none");
    for (const viewportWidth of [320, 375, 768]) {
      await page.setViewportSize({ width: viewportWidth, height: 900 });
      const responsiveSamples = await page.evaluate(collectMeasurements, USED_SAMPLES);
      assert.equal(new Set(responsiveSamples.map((row) => row.width)).size, 1,
        `窄屏切换宽度跳动：${viewportWidth}`);
      const bounds = await page.locator(".gc-pill-container").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewportWidth,
        `胶囊超出视口：${viewportWidth} ${JSON.stringify(bounds)}`);
    }
    assert.deepEqual(pageErrors, []);
    // 使用未修改入口的完整脚本，模拟官方 CSR 用量页：GET 无数据，
    // 顶层后台页才有可见文本，验证刷新按钮到跨页回传的完整链路。
    const context = await browser.newContext();
    try {
      const usagePaths = [];
      let rpcCount = 0;
      let used = 12;
      let popupCount = 0;
      let failRpc = false;
      await context.route("https://gemini.google.com/**", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.endsWith("/usage")) usagePaths.push(url.pathname);
        if (url.pathname.endsWith("/batchexecute")) {
          rpcCount += 1;
          if (failRpc) return route.fulfill({status: 503, body: "Unavailable"});
          assert.equal(url.pathname, "/u/1/_/BardChatUi/data/batchexecute");
          assert.equal(url.searchParams.get("source-path"), "/u/1/usage");
          const params = new URLSearchParams(request.postData());
          assert.equal(params.get("at"), "test-token");
          assert.deepEqual(JSON.parse(params.get("f.req")), [[["jSf9Qc", [], null, "generic"]]]);
          const now = Date.now();
          const payload = [2, [[2400, used / 100, 1, [[Math.floor(now / 1000) + 7200, 0]]], [48106, 0.68, 2, [[Math.floor(now / 1000) + 259200, 0]]], [100, 0.9, 4, [[Math.floor(now / 1000) + 3600, 0]]]], false];
          const frame = JSON.stringify([["wrb.fr", "jSf9Qc", JSON.stringify(payload), null]]);
          return route.fulfill({contentType: "application/json", body: frame});
        }
        return route.fulfill({contentType: "text/html", body: "<!doctype html><html><body></body></html>"});
      });
      await context.addInitScript(() => { window.WIZ_global_data = {SNlM0e: "test-token", cfb2h: "build", FdrFJe: "session"}; });
      await context.addInitScript({ content: originalSource });
      const app = await context.newPage();
      app.on("popup", () => popupCount += 1);
      await app.goto("https://gemini.google.com/u/1/app");
      await app.waitForFunction(() => window.__gqc.state.fiveHour.usedPct === 12);
      assert.equal(rpcCount, 1, "启动时自动获取，无需点击");
      used = 23;
      await app.evaluate(() => { window.__gqc.sync(); window.__gqc.sync(); window.__gqc.sync(); });
      await app.waitForFunction(() => window.__gqc.state.isSyncing === false && window.__gqc.state.fiveHour.usedPct === 23);
      assert.equal(rpcCount, 2, "连续刷新只发送一个请求");
      await app.clock.install();
      used = 34;
      await app.clock.fastForward(190000);
      await app.waitForFunction(() => window.__gqc.state.fiveHour.usedPct === 34);
      failRpc = true;
      assert.equal(await app.evaluate(() => window.__gqc.sync()), false);
      assert.equal(await app.evaluate(() => window.__gqc.state.fiveHour.usedPct), 34);
      assert.match(await app.evaluate(() => window.__gqc.state.lastError), /503/);
      failRpc = false;
      used = 45;
      await app.clock.fastForward(30000);
      await app.waitForFunction(() => window.__gqc.state.fiveHour.usedPct === 45);
      assert.equal(await app.evaluate(() => window.__gqc.state.lastError), "");
      assert.equal(popupCount, 0);
      assert.deepEqual(usagePaths, []);
      assert.equal(context.pages().length, 1);
      assert.equal(app.url(), "https://gemini.google.com/u/1/app");
      console.log("静默刷新链路通过：启动自动获取、手动连点去重、周期自动更新，无 popup 或 Usage 页面请求。");
    } finally {
      await context.close();
    }
    console.log(`连续更新审计（每形态 1000 次）：${JSON.stringify(audit)}`);

    console.log(
      `布局回归通过：${MODE_KEYS.length} 形态 × ${USED_SAMPLES.length} 用量，胶囊宽度恒为 ${widths[0]}px，槽位恒为 ${TRACK_WIDTH_PX}px。`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
