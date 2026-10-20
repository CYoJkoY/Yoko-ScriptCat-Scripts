#!/usr/bin/env node
// Gemini Quota Capsule 布局回归：验证组件样式切换、自定义资源与胶囊宽度恒定。
//
// 运行方式（PowerShell）：
//   $env:GQC_PLAYWRIGHT_MODULE='<本机 playwright 模块目录>'
//   node tests/gemini-quota-capsule-layout.test.cjs
// 缺少 Playwright 时失败，避免把未执行的浏览器验证误报为通过。

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");

const SCRIPT_PATH = path.join(__dirname, "..", "scripts", "gemini-quota-capsule.js");
const CONFIG_KEY = "__gemini_quota_capsule_cfg_v5__";
// 与脚本内 ORNAMENT_MODES / PROGRESS_MODE_CHOICES 保持同序；脚本新增时这里必须同步。
const ORNAMENT_KEYS = ["prism", "spark", "orbit", "capsule", "bolt", "none"];
const PROGRESS_KEYS = ["bar", "ring", "disk", "decay", "segments", "battery", "columns", "none"];
// 「已用」百分比样本：边界 0、中段 42、满载 100，覆盖文本位数变化与颜色阈值。
const USED_SAMPLES = [0, 42, 100];
const SLOT_WIDTH_PX = 24;
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

// 按候选顺序尝试加载 Playwright；返回 null 表示环境未提供。
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
      if (entry !== "chromium") options.channel = entry;
      return await chromium.launch(options);
    } catch (error) {
      errors.push(`${entry}: ${error.message}`);
    }
  }
  throw new Error(`无法启动浏览器：${errors.join("; ")}`);
}

// 清空站点配置后重新注入脚本，保证每个场景从确定的初始状态开始。
async function freshLoad(page, source, config) {
  await page.goto("https://gemini.google.com/app");
  await page.evaluate(
    ({ key, value }) => {
      localStorage.clear();
      if (value) localStorage.setItem(key, JSON.stringify(value));
    },
    { key: CONFIG_KEY, value: config || null },
  );
  await page.reload();
  await page.addScriptTag({ content: source });
}

// 在页面内依次切换装饰与两段进度，回传宽度、槽位与选中状态。
function collectLayout({ ornaments, modes, samples }) {
  const round = (value) => Math.round(value * 100) / 100;
  const pill = document.querySelector(".gc-pill-container");
  const head = document.querySelector(".gc-capsule-head");
  const slots = () => [...document.querySelectorAll(".gc-progress-slot")];
  const open = document.querySelectorAll(".gc-btn-icon");
  const settings = open[open.length - 1];
  if (!document.querySelector("#gc-pill-drawer").classList.contains("gc-active")) {
    settings.click();
  }

  const rows = [];
  for (const used of samples) {
    for (const metric of ["fiveHour", "weekly"]) {
      Object.assign(window.__gqc.state[metric], {
        pct: 100 - used,
        usedPct: used,
        resetAt: Date.now() + 3600 * 1000,
        updatedAt: Date.now(),
      });
    }
    window.__testUpdateUI();

    for (const ornament of ornaments) {
      document.querySelector(`.gc-choice-btn[data-ornament="${ornament}"]`).click();
      rows.push({
        kind: "ornament",
        used,
        ornament,
        width: round(pill.getBoundingClientRect().width),
        headWidth: round(head.getBoundingClientRect().width),
        headChildren: head.childElementCount,
        activeOrnaments: document.querySelectorAll(
          ".gc-ornament-grid .gc-choice-btn.active",
        ).length,
      });
    }

    for (const metric of ["fiveHour", "weekly"]) {
      for (const mode of modes) {
        document.querySelector(
          `.gc-mode-grid[data-gc-metric="${metric}"] .gc-choice-btn[data-mode="${mode}"]`,
        ).click();
        const measured = slots().map((slot) => ({
          width: round(slot.getBoundingClientRect().width),
          children: slot.childElementCount,
          mode: slot.dataset.mode,
        }));
        rows.push({
          kind: "progress",
          used,
          metric,
          mode,
          width: round(pill.getBoundingClientRect().width),
          slots: measured,
          configMetrics: { ...window.__gqc.config.metrics },
          activePerGrid: [...document.querySelectorAll(".gc-mode-grid")].map(
            (grid) => grid.querySelectorAll(".gc-choice-btn.active").length,
          ),
        });
      }
    }
  }
  return rows;
}

// 固定用量下连续刷新，确认静态图形不重建、只有数值相关节点更新。
function auditNodeReuse(modes) {
  const head = document.querySelector(".gc-capsule-head");
  const [fiveSlot, weekSlot] = document.querySelectorAll(".gc-progress-slot");
  document.querySelector('[data-ornament="prism"]').click();
  const rows = [];
  for (const mode of modes) {
    for (const metric of ["fiveHour", "weekly"]) {
      document.querySelector(
        `.gc-mode-grid[data-gc-metric="${metric}"] .gc-choice-btn[data-mode="${mode}"]`,
      ).click();
    }
    Object.assign(window.__gqc.state.fiveHour, {
      pct: 80,
      usedPct: 20,
      resetAt: null,
    });
    Object.assign(window.__gqc.state.weekly, {
      pct: 10,
      usedPct: 90,
      resetAt: null,
    });
    window.__testUpdateUI();

    const fiveNode = fiveSlot.firstElementChild;
    const weekNode = weekSlot.firstElementChild;
    const headNode = head.firstElementChild;
    const countBefore = document.querySelectorAll("#gc-pill-root *").length;
    const observer = new MutationObserver(() => {});
    for (const node of [fiveSlot, weekSlot, head]) {
      observer.observe(node, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }
    const started = performance.now();
    for (let index = 0; index < 1000; index += 1) window.__testUpdateUI();
    const duration = performance.now() - started;
    const mutations = observer.takeRecords().length;
    observer.disconnect();
    const countStable =
      countBefore === document.querySelectorAll("#gc-pill-root *").length;
    const fiveRects =
      mode === "columns"
        ? [...fiveSlot.querySelectorAll("rect")].map((rect) =>
            Number(rect.getAttribute("height")),
          )
        : null;

    window.__gqc.state.weekly.usedPct = 10;
    window.__testUpdateUI();
    rows.push({
      mode,
      duration,
      mutations,
      countStable,
      headStable: head.firstElementChild === headNode,
      fiveStable: fiveSlot.firstElementChild === fiveNode,
      weeklyChanged:
        mode === "none" ? true : weekSlot.firstElementChild !== weekNode,
      fiveRects,
    });
  }
  return rows;
}

async function main() {
  const playwright = loadPlaywright();
  if (playwright === null) {
    throw new Error("未找到 Playwright，请设置 GQC_PLAYWRIGHT_MODULE 指向本机安装。");
  }

  const originalSource = fs.readFileSync(SCRIPT_PATH, "utf8");
  // 只建 DOM、不做网络同步，避免测试依赖真实 Gemini 页面与登录态。
  const marker = "  bootstrap();";
  const source = originalSource.replace(
    marker,
    "  createDOM(); window.__testUpdateUI = updateUI;",
  );
  assert.notEqual(source, originalSource, "未找到 bootstrap() 调用，脚本入口结构可能已变化");

  const browser = await launchBrowser(playwright.chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("https://gemini.google.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await freshLoad(page, source, null);

    const rows = await page.evaluate(collectLayout, {
      ornaments: ORNAMENT_KEYS,
      modes: PROGRESS_KEYS,
      samples: USED_SAMPLES,
    });
    const expectedRows =
      USED_SAMPLES.length * (ORNAMENT_KEYS.length + 2 * PROGRESS_KEYS.length);
    assert.equal(rows.length, expectedRows, "测量条数不符");

    const widths = [...new Set(rows.map((row) => row.width))];
    assert.equal(widths.length, 1, `胶囊宽度发生跳动：${widths.join(", ")}`);
    const baseWidth = widths[0];

    for (const row of rows) {
      if (row.kind === "ornament") {
        assert.equal(row.headWidth, 16, `装饰槽位宽度变化：${JSON.stringify(row)}`);
        assert.equal(
          row.headChildren,
          row.ornament === "none" ? 0 : 1,
          `装饰节点数不符：${JSON.stringify(row)}`,
        );
        assert.equal(row.activeOrnaments, 1, `装饰选中数不符：${JSON.stringify(row)}`);
        continue;
      }
      assert.equal(row.slots.length, 2, `进度槽位数量不符：${JSON.stringify(row)}`);
      assert.equal(row.slots[0].mode, row.configMetrics.fiveHour);
      assert.equal(row.slots[1].mode, row.configMetrics.weekly);
      assert.equal(row.configMetrics[row.metric], row.mode);
      for (const slot of row.slots) {
        assert.equal(slot.width, SLOT_WIDTH_PX, `槽位宽度被改动：${JSON.stringify(row)}`);
        assert.equal(
          slot.children,
          slot.mode === "none" ? 0 : 1,
          `槽位内容与形态不符：${JSON.stringify(row)}`,
        );
      }
      assert.deepEqual(row.activePerGrid, [1, 1], `进度选中数不符：${JSON.stringify(row)}`);
    }

    // 连续更新：装饰与进度图形在数值不变时必须完全静止。
    const audit = await page.evaluate(auditNodeReuse, PROGRESS_KEYS);
    for (const row of audit) {
      assert.equal(row.mutations, 0, `静态图形重复写入：${JSON.stringify(row)}`);
      assert.equal(row.countStable, true, `节点数增长：${row.mode}`);
      assert.equal(row.headStable, true, `装饰被重建：${row.mode}`);
      assert.equal(row.fiveStable, true, `未变化的 5H 图形被重建：${row.mode}`);
      assert.equal(row.weeklyChanged, true, `用量变化未重绘：${row.mode}`);
      if (row.fiveRects !== null) {
        assert.deepEqual(row.fiveRects, [14, 14, 2.8, 11.2]);
      }
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
        result.push({
          text: group.querySelector(".gc-pill-timer").textContent,
          percent: group.querySelector(".gc-pill-counter").textContent,
          width: document.querySelector(".gc-pill-container").getBoundingClientRect().width,
          expected: scenario.expected,
        });
      }
      window.__gqc.state.isSyncing = true;
      window.__testUpdateUI();
      result.push({
        text: document.querySelector(".gc-pill-timer").textContent,
        spinning: document.querySelector(".gc-btn-icon").classList.contains("gc-spinning"),
      });
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

    // 键盘轮换装饰并持久化；刷新后恢复同一装饰与进度组合。
    await page.evaluate(() =>
      document.querySelector('[data-ornament="prism"]').click(),
    );
    await page.locator(".gc-capsule-head").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => window.__gqc.config.icon.kind), "spark");
    await page.keyboard.press("Space");
    assert.equal(await page.evaluate(() => window.__gqc.config.icon.kind), "orbit");
    await page.evaluate(() => {
      document
        .querySelector('.gc-mode-grid[data-gc-metric="fiveHour"] .gc-choice-btn[data-mode="ring"]')
        .click();
      document
        .querySelector('.gc-mode-grid[data-gc-metric="weekly"] .gc-choice-btn[data-mode="columns"]')
        .click();
    });
    await page.reload();
    await page.addScriptTag({ content: source });
    const restored = await page.evaluate(() => ({
      icon: window.__gqc.config.icon.kind,
      metrics: { ...window.__gqc.config.metrics },
    }));
    assert.deepEqual(restored, {
      icon: "orbit",
      metrics: { fiveHour: "ring", weekly: "columns" },
    });

    // 旧版 styleMode 迁移：两段进度都继承旧值，装饰保持默认棱镜。
    await freshLoad(page, source, {
      styleMode: "ring",
      pos: { right: 25, bottom: 90 },
    });
    const migrated = await page.evaluate(() => ({
      styleMode: window.__gqc.config.styleMode,
      icon: window.__gqc.config.icon.kind,
      metrics: { ...window.__gqc.config.metrics },
      slotModes: [...document.querySelectorAll(".gc-progress-slot")].map(
        (slot) => slot.dataset.mode,
      ),
      pos: { ...window.__gqc.config.pos },
    }));
    assert.deepEqual(migrated, {
      styleMode: "ring",
      icon: "prism",
      metrics: { fiveHour: "ring", weekly: "ring" },
      slotModes: ["ring", "ring"],
      pos: { right: 25, bottom: 90 },
    });

    // 自定义 CSS：按组件作用域生效，拒绝闭合规则与外部 at-rule。
    await freshLoad(page, source, null);
    const cssResult = await page.evaluate(async () => {
      const buttons = document.querySelectorAll(".gc-btn-icon");
      buttons[buttons.length - 1].click();
      const select = document.querySelector(".gc-select");
      const textarea = document.querySelector(".gc-css-textarea");
      const applyButton = document.querySelector('[data-gc-action="css-apply"]');
      const clearButton = document.querySelector('[data-gc-action="css-clear"]');
      const status = () => document.querySelector(".gc-style-status").textContent;
      const width = () =>
        document.querySelector(".gc-pill-container").getBoundingClientRect().width;
      const apply = (target, value) => {
        select.value = target;
        select.dispatchEvent(new Event("change"));
        textarea.value = value;
        applyButton.click();
        return { status: status(), stored: window.__gqc.config.css[target] };
      };
      const before = width();
      const counter = apply("counter", "color: rgb(1, 2, 3);");
      const counterColor = getComputedStyle(
        document.querySelector(".gc-pill-counter"),
      ).color;
      const head = apply("head", "color: rgb(4, 5, 6);");
      const badge = apply("badge", "color: rgb(10, 11, 12);");
      const timer = apply("timer", "color: rgb(13, 14, 15);");
      const progress = apply(
        "progress",
        "--gc-progress-color: rgb(16, 17, 18);",
      );
      // 头部 0.2s、进度填充 0.3s 的颜色过渡结束后再读取计算样式。
      await new Promise((resolve) => setTimeout(resolve, 420));
      const headColor = getComputedStyle(
        document.querySelector(".gc-capsule-head"),
      ).color;
      const badgeColor = getComputedStyle(
        document.querySelector(".gc-pill-badge"),
      ).color;
      const timerColor = getComputedStyle(
        document.querySelector(".gc-pill-timer"),
      ).color;
      const progressColor = getComputedStyle(
        document.querySelector(".gc-inline-fill"),
      ).backgroundColor;
      const after = width();
      const rejected = [];
      for (const value of [
        "color: red; } body { display: none;",
        "color: red; @import url(https://evil.example/x.css);",
        "background: expression(alert(1));",
        'content: "<";',
        `color: red; ${"x".repeat(8192)}`,
      ]) {
        rejected.push(apply("counter", value));
      }
      const afterRejected = window.__gqc.config.css.counter;
      const clearedCounter = (() => {
        select.value = "counter";
        select.dispatchEvent(new Event("change"));
        clearButton.click();
        return {
          status: status(),
          stored: window.__gqc.config.css.counter,
          color: getComputedStyle(document.querySelector(".gc-pill-counter")).color,
        };
      })();
      return {
        before,
        after,
        counter,
        counterColor,
        head,
        headColor,
        badge,
        badgeColor,
        timer,
        timerColor,
        progress,
        progressColor,
        rejected,
        afterRejected,
        clearedCounter,
      };
    });
    assert.equal(cssResult.before, cssResult.after, "自定义 CSS 改变了胶囊宽度");
    assert.equal(cssResult.counter.stored, "color: rgb(1, 2, 3);");
    assert.equal(cssResult.counterColor, "rgb(1, 2, 3)");
    assert.match(cssResult.counter.status, /已应用/);
    assert.equal(cssResult.head.stored, "color: rgb(4, 5, 6);");
    assert.equal(cssResult.headColor, "rgb(4, 5, 6)");
    // 内置配色走 CSS 变量，用户声明无需 !important 即可覆盖。
    assert.equal(cssResult.badge.stored, "color: rgb(10, 11, 12);");
    assert.equal(cssResult.timer.stored, "color: rgb(13, 14, 15);");
    assert.equal(
      cssResult.progress.stored,
      "--gc-progress-color: rgb(16, 17, 18);",
    );
    assert.equal(cssResult.badgeColor, "rgb(10, 11, 12)");
    assert.equal(cssResult.timerColor, "rgb(13, 14, 15)");
    assert.equal(cssResult.progressColor, "rgb(16, 17, 18)");
    assert.equal(cssResult.afterRejected, "color: rgb(1, 2, 3);");
    for (const attempt of cssResult.rejected) {
      assert.match(attempt.status, /CSS 不可用/);
      assert.equal(attempt.stored, "color: rgb(1, 2, 3);");
    }
    assert.equal(cssResult.clearedCounter.stored, "");
    assert.equal(cssResult.clearedCounter.color, "rgb(255, 255, 255)");

    // CSS 在刷新后仍自动注入。
    await page.evaluate(() => {
      const select = document.querySelector(".gc-select");
      const textarea = document.querySelector(".gc-css-textarea");
      select.value = "counter";
      select.dispatchEvent(new Event("change"));
      textarea.value = "color: rgb(7, 8, 9);";
      document.querySelector('[data-gc-action="css-apply"]').click();
    });
    await page.reload();
    await page.addScriptTag({ content: source });
    assert.equal(
      await page.evaluate(() =>
        getComputedStyle(document.querySelector(".gc-pill-counter")).color,
      ),
      "rgb(7, 8, 9)",
    );

    // 自定义 SVG：脚本、事件、foreignObject、外部引用一律丢弃。
    await freshLoad(page, source, null);
    const svgResult = await page.evaluate(() => {
      const buttons = document.querySelectorAll(".gc-btn-icon");
      buttons[buttons.length - 1].click();
      const button = document.querySelector('[data-gc-action="svg-editor"]');
      const applyButton = document.querySelector('[data-gc-action="svg-apply"]');
      const textarea = document.querySelector(".gc-editor .gc-textarea");
      const status = () => document.querySelector(".gc-style-status").textContent;
      const head = document.querySelector(".gc-capsule-head");
      const width = () =>
        document.querySelector(".gc-pill-container").getBoundingClientRect().width;
      const before = width();
      button.click();
      textarea.value = [
        '<svg viewBox="0 0 16 16" onload="alert(1)">',
        '<script>alert(1)</script>',
        '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>',
        '<path id="p" d="M0 0h16v16z" fill="url(#g)" onclick="alert(2)"/>',
        '<image href="https://evil.example/x.png"/>',
        "</svg>",
      ].join("");
      applyButton.click();
      const first = {
        status: status(),
        kind: window.__gqc.config.icon.kind,
        width: width(),
        scripts: head.querySelectorAll("script").length,
        foreign: head.querySelectorAll("foreignObject").length,
        images: head.querySelectorAll("image").length,
        path: {
          present: Boolean(head.querySelector("path")),
          fill: head.querySelector("path")?.getAttribute("fill") ?? null,
          onclick: head.querySelector("path")?.hasAttribute("onclick") ?? false,
        },
        gradientId: head.querySelector("linearGradient")?.getAttribute("id") || "",
      };

      textarea.value =
        '<svg viewBox="0 0 16 16"><path d="M0 0h16v16z" fill="url(https://evil.example/x.svg#a)"/></svg>';
      applyButton.click();
      const external = {
        fill: head.querySelector("path")?.getAttribute("fill") ?? null,
        status: status(),
      };

      textarea.value = "<div>not svg</div>";
      applyButton.click();
      const invalid = { status: status(), kind: window.__gqc.config.icon.kind };

      const previousSvg = window.__gqc.config.icon.svg;
      textarea.value = '<svg><script>alert(1)</script><defs><path d="M0 0h16v16z"/></defs></svg>';
      applyButton.click();
      const empty = {
        status: status(),
        unchanged: window.__gqc.config.icon.svg === previousSvg,
      };

      textarea.value = `<svg viewBox="0 0 16 16">${"x".repeat(21000)}</svg>`;
      applyButton.click();
      const oversized = { status: status() };

      document.querySelector('[data-gc-action="clear-custom"]').click();
      const cleared = {
        kind: window.__gqc.config.icon.kind,
        svg: window.__gqc.config.icon.svg,
      };
      return { before, first, external, invalid, empty, oversized, cleared };
    });
    assert.equal(svgResult.before, svgResult.first.width, "自定义 SVG 改变了胶囊宽度");
    assert.match(svgResult.first.status, /SVG 图标已应用/);
    assert.equal(svgResult.first.kind, "svg");
    assert.equal(svgResult.first.scripts, 0);
    assert.equal(svgResult.first.foreign, 0);
    assert.equal(svgResult.first.images, 0);
    assert.equal(svgResult.first.path.present, true, "合法图形未保留");
    assert.equal(svgResult.first.path.onclick, false);
    assert.match(
      svgResult.first.path.fill,
      /^url\(#gc-user-svg-[a-z0-9]+-g\)$/,
    );
    assert.match(svgResult.first.gradientId, /^gc-user-svg-/);
    assert.equal(svgResult.external.fill, null, "外部 url() 引用未被丢弃");
    assert.match(svgResult.invalid.status, /完整的 SVG 根元素/);
    assert.equal(svgResult.invalid.kind, "svg");
    assert.match(svgResult.empty.status, /没有可显示的图形/);
    assert.equal(svgResult.empty.unchanged, true);
    assert.match(svgResult.oversized.status, /SVG 超过 20KB 上限/);
    assert.deepEqual(svgResult.cleared, { kind: "prism", svg: "" });

    // 本地图片：小图生效并持久化，超限与错误类型被拒绝。
    await freshLoad(page, source, null);
    const beforeImageWidth = await page.evaluate(() =>
      document.querySelector(".gc-pill-container").getBoundingClientRect().width,
    );
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "dot.png", { type: "image/png" }));
      const input = document.querySelector('input[type="file"]');
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
    }, TINY_PNG_BASE64);
    await page.waitForFunction(() => window.__gqc.config.icon.kind === "image");
    const imageApplied = await page.evaluate(() => ({
      kind: window.__gqc.config.icon.kind,
      src: document.querySelector(".gc-capsule-head img")?.getAttribute("src") || "",
      width: document.querySelector(".gc-pill-container").getBoundingClientRect().width,
      status: document.querySelector(".gc-style-status").textContent,
      dumpIcon: window.__gqc.dump().config.icon,
    }));
    assert.equal(imageApplied.kind, "image");
    assert.ok(imageApplied.src.startsWith("data:image/png;base64,"));
    assert.equal(imageApplied.width, beforeImageWidth, "图片图标改变了胶囊宽度");
    assert.match(imageApplied.status, /图片图标已应用/);
    assert.equal(typeof imageApplied.dumpIcon.imageChars, "number");
    assert.equal("image" in imageApplied.dumpIcon, false);

    const rejectedImage = await page.evaluate(async () => {
      const input = document.querySelector('input[type="file"]');
      const dispatch = (file) => {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event("change"));
      };
      const original = window.__gqc.config.icon.image;
      dispatch(new File([new Uint8Array(256 * 1024 + 1)], "big.png", {
        type: "image/png",
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const oversized = {
        status: document.querySelector(".gc-style-status").textContent,
        unchanged: window.__gqc.config.icon.image === original,
      };
      dispatch(new File(["hello"], "note.txt", { type: "text/plain" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      return {
        oversized,
        unsupported: {
          status: document.querySelector(".gc-style-status").textContent,
          unchanged: window.__gqc.config.icon.image === original,
        },
      };
    });
    assert.match(rejectedImage.oversized.status, /256KB 上限/);
    assert.equal(rejectedImage.oversized.unchanged, true);
    assert.match(rejectedImage.unsupported.status, /仅支持/);
    assert.equal(rejectedImage.unsupported.unchanged, true);

    // MIME 合法但内容损坏时，不保存假图片或显示成功。
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(["not a png"], "broken.png", { type: "image/png" }));
      const input = document.querySelector('input[type="file"]');
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
    });
    await page.waitForFunction(() =>
      document.querySelector(".gc-style-status").textContent.includes("图片损坏"),
    );
    assert.equal(await page.evaluate(() => window.__gqc.config.icon.image), imageApplied.src);

    // 旧 SVG 文件读取在用户清除资源后完成，必须丢弃旧结果。
    const staleUpload = await page.evaluate(async () => {
      const file = new File(["unused"], "slow.svg", { type: "image/svg+xml" });
      let finish;
      Object.defineProperty(file, "text", {
        value: () => new Promise((resolve) => { finish = resolve; }),
      });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const input = document.querySelector('input[type="file"]');
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
      document.querySelector('[data-gc-action="clear-custom"]').click();
      finish('<svg><circle cx="8" cy="8" r="6"/></svg>');
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { kind: window.__gqc.config.icon.kind, svg: window.__gqc.config.icon.svg };
    });
    assert.deepEqual(staleUpload, { kind: "prism", svg: "" });

    // 恢复有效图片，继续验证重载与存储回滚。
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "dot.png", { type: "image/png" }));
      const input = document.querySelector('input[type="file"]');
      input.files = transfer.files;
      input.dispatchEvent(new Event("change"));
    }, TINY_PNG_BASE64);
    await page.waitForFunction(() => window.__gqc.config.icon.kind === "image");

    // 刷新后图片配置恢复。
    await page.reload();
    await page.addScriptTag({ content: source });
    assert.equal(await page.evaluate(() => window.__gqc.config.icon.kind), "image");
    assert.ok(
      await page.evaluate(() =>
        Boolean(document.querySelector(".gc-capsule-head img")),
      ),
    );

    // 存储失败：配置回滚，并把原因显示在抽屉顶部。
    const storageFailure = await page.evaluate(() => {
      const kindBefore = window.__gqc.config.icon.kind;
      const descriptor = Object.getOwnPropertyDescriptor(
        Storage.prototype,
        "setItem",
      );
      let injected = false;
      try {
        Object.defineProperty(Storage.prototype, "setItem", {
          configurable: true,
          value() {
            throw new DOMException("QuotaExceededError", "QuotaExceededError");
          },
        });
        localStorage.setItem("__gqc_quota_probe__", "x");
      } catch (error) {
        injected = error?.name === "QuotaExceededError";
      }
      let first;
      let second;
      try {
        document.querySelector('[data-ornament="spark"]').click();
        first = {
          status: document.querySelector(".gc-style-status").textContent,
          kind: window.__gqc.config.icon.kind,
        };
        document.querySelector(".gc-capsule-head").click();
        second = {
          status: document.querySelector(".gc-style-status").textContent,
          kind: window.__gqc.config.icon.kind,
        };
      } finally {
        Object.defineProperty(Storage.prototype, "setItem", {
          configurable: true,
          value: descriptor.value,
          writable: descriptor.writable,
        });
      }
      return {
        kindBefore,
        injected,
        first,
        second,
      };
    });
    assert.equal(storageFailure.kindBefore, "image");
    assert.equal(storageFailure.injected, true, "未能注入存储写入失败");
    assert.match(storageFailure.first.status, /保存失败/);
    assert.equal(storageFailure.first.kind, "image");
    assert.match(storageFailure.second.status, /保存失败/);
    assert.equal(storageFailure.second.kind, "image");

    // 减少动态效果：崩坏形态在满用量下仍关闭动画。
    await page.emulateMedia({ reducedMotion: "reduce" });
    const animation = await page.evaluate(() => {
      Object.assign(window.__gqc.state.fiveHour, { pct: 0, usedPct: 100 });
      window.__testUpdateUI();
      document
        .querySelector('.gc-mode-grid[data-gc-metric="fiveHour"] .gc-choice-btn[data-mode="decay"]')
        .click();
      return getComputedStyle(document.querySelector(".gc-state-critical")).animationName;
    });
    assert.equal(animation, "none");

    // 窄窗口：装饰与进度任意组合都不撑宽，也不越出视口。
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await freshLoad(page, source, null);
    for (const viewportWidth of [320, 375, 768]) {
      await page.setViewportSize({ width: viewportWidth, height: 900 });
      const responsive = await page.evaluate(collectLayout, {
        ornaments: ORNAMENT_KEYS,
        modes: PROGRESS_KEYS,
        samples: [42],
      });
      assert.equal(
        new Set(responsive.map((row) => row.width)).size,
        1,
        `窄屏切换宽度跳动：${viewportWidth}`,
      );
      const bounds = await page.locator(".gc-pill-container").boundingBox();
      assert.ok(
        bounds.x >= 0 && bounds.x + bounds.width <= viewportWidth,
        `胶囊超出视口：${viewportWidth} ${JSON.stringify(bounds)}`,
      );
    }
    assert.deepEqual(pageErrors, []);

    // 官方 /usage 是纯 CSR 页面：网络层返回固定文本，避免依赖真实登录态。
    const usageHtml =
      "<!doctype html><html><body><main><h1>Usage limits</h1>" +
      "<h2>Current usage</h2><p>12% used</p><p>Resets in 2 hr</p>" +
      "<h2>Weekly limit</h2><p>68% used</p><p>Resets in 3 days</p>" +
      "</main></body></html>";
    const emptyHtml = "<!doctype html><html><body></body></html>";
    // @noframes：真实用户脚本只在顶层文档执行。测试注入必须显式模拟，
    // 否则隐藏 iframe 也会跑一遍 bootstrap，把兜底链路变成自我递归。
    const topFrameOnlySource =
      "if (window.top === window.self) {\n" + originalSource + "\n}";

    // <style> 正文不属于可见文本。旧版只剔除 <script>，样式里的百分比会
    // 混进 textContent，被按行解析当成用量。
    const styleStrippedText = await page.evaluate(() => {
      const doc = window.__gqc._test.parseHtmlDocument(
        "<!doctype html><html><body><style>.meter{width:99%}</style>" +
          "<p>12% used</p><p>Resets in 2 hr</p></body></html>",
      );
      return doc && doc.body ? doc.body.textContent : null;
    });
    assert.ok(
      styleStrippedText && styleStrippedText.includes("12% used"),
      "清理后的文本缺少用量",
    );
    assert.ok(!styleStrippedText.includes("99%"), "style 正文混入了可见文本");

    // 页面时钟可能被 Playwright 接管，页内轮询不会自行推进；统一从 Node 侧观察。
    const waitForState = async (target, expected, timeoutMs = 30000) => {
      const deadline = Date.now() + timeoutMs;
      let snapshot = null;
      while (Date.now() < deadline) {
        snapshot = await target.evaluate(() => ({
          used: window.__gqc.state.fiveHour.usedPct,
          weekly: window.__gqc.state.weekly.usedPct,
          syncing: window.__gqc.state.isSyncing,
          error: window.__gqc.state.lastError,
        }));
        if (
          snapshot.syncing === false &&
          snapshot.used === expected.fiveHour &&
          (expected.weekly === undefined || snapshot.weekly === expected.weekly)
        ) {
          return snapshot;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("等待用量状态超时：" + JSON.stringify(snapshot));
    };

    // 场景 A：RPC 正常。启动自动获取、连点去重、到期自动更新；
    // 全程不请求 /usage、不打开标签页、不跳转。
    {
      const usagePaths = [];
      let rpcCount = 0;
      let used = 12;
      let popupCount = 0;
      const context = await browser.newContext();
      try {
        await context.route("https://gemini.google.com/**", (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.pathname.endsWith("/usage")) usagePaths.push(url.pathname);
          if (url.pathname.endsWith("/batchexecute")) {
            rpcCount += 1;
            assert.equal(url.pathname, "/u/1/_/BardChatUi/data/batchexecute");
            assert.equal(url.searchParams.get("source-path"), "/u/1/usage");
            const params = new URLSearchParams(request.postData());
            assert.equal(params.get("at"), "test-token");
            const freq = JSON.parse(params.get("f.req"));
            // f.req 的 args 是二次编码后的 JSON 文本；与 1.0.1 的裸数组形态不同。
            assert.equal(typeof freq[0][0][1], "string");
            assert.deepEqual(freq, [[["jSf9Qc", "[]", null, "generic"]]]);
            const now = Date.now();
            const payload = [
              2,
              [
                [2400, used / 100, 1, [[Math.floor(now / 1000) + 7200, 0]]],
                [48106, 0.68, 2, [[Math.floor(now / 1000) + 259200, 0]]],
                [100, 0.9, 4, [[Math.floor(now / 1000) + 3600, 0]]],
              ],
              false,
            ];
            const frame = JSON.stringify([
              ["wrb.fr", "jSf9Qc", JSON.stringify(payload), null],
            ]);
            return route.fulfill({ contentType: "application/json", body: frame });
          }
          return route.fulfill({ contentType: "text/html", body: emptyHtml });
        });
        await context.addInitScript(() => {
          window.WIZ_global_data = {
            SNlM0e: "test-token",
            cfb2h: "build",
            FdrFJe: "session",
          };
        });
        await context.addInitScript({ content: topFrameOnlySource });
        const app = await context.newPage();
        app.on("popup", () => (popupCount += 1));
        await app.goto("https://gemini.google.com/u/1/app");
        await waitForState(app, { fiveHour: 12 }, 30000);
        assert.equal(rpcCount, 1, "启动时自动获取，无需点击");
        assert.equal(popupCount, 0, "自动同步不得打开标签页");
        used = 23;
        await app.evaluate(() => {
          window.__gqc.sync();
          window.__gqc.sync();
          window.__gqc.sync();
        });
        await waitForState(app, { fiveHour: 23 }, 30000);
        assert.equal(rpcCount, 2, "连续刷新只发送一个请求");
        await app.clock.install();
        used = 34;
        await app.clock.fastForward(190000);
        await waitForState(app, { fiveHour: 34 }, 30000);
        assert.equal(await app.evaluate(() => window.__gqc.state.lastError), "");
        assert.equal(popupCount, 0);
        assert.deepEqual(usagePaths, []);
        assert.equal(context.pages().length, 1);
        assert.equal(app.url(), "https://gemini.google.com/u/1/app");
        console.log(
          "静默 RPC 链路通过：启动自动获取、连点去重、到期自动更新，无 popup 或 /usage 请求。",
        );
      } finally {
        await context.close();
      }
    }

    // 场景 B：RPC 503。GET 探测只拿到空壳，隐藏同源 iframe 渲染出用量文本后回填；
    // 仍然不跳转、不开标签页，且只请求当前账号的 /u/1/usage。
    {
      const frameUsagePaths = [];
      let frameRpcCount = 0;
      let framePopupCount = 0;
      const frameContext = await browser.newContext();
      try {
        await frameContext.route("https://gemini.google.com/**", (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.pathname.endsWith("/batchexecute")) {
            frameRpcCount += 1;
            return route.fulfill({ status: 503, body: "Unavailable" });
          }
          if (url.pathname.endsWith("/usage")) {
            frameUsagePaths.push(url.pathname);
            const isSubframeDocument =
              request.isNavigationRequest() && request.frame().parentFrame() !== null;
            return route.fulfill({
              contentType: "text/html",
              body: isSubframeDocument ? usageHtml : emptyHtml,
            });
          }
          return route.fulfill({ contentType: "text/html", body: emptyHtml });
        });
        await frameContext.addInitScript(() => {
          window.WIZ_global_data = { SNlM0e: "test-token", cfb2h: "build", FdrFJe: "session" };
        });
        await frameContext.addInitScript({ content: topFrameOnlySource });
        const frameApp = await frameContext.newPage();
        frameApp.on("popup", () => (framePopupCount += 1));
        await frameApp.goto("https://gemini.google.com/u/1/app");
        const frameState = await waitForState(frameApp, { fiveHour: 12, weekly: 68 }, 60000);
        assert.equal(frameState.error, "", "兜底成功后应清除 RPC 失败状态");
        assert.ok(frameRpcCount >= 1, "应至少尝试一次官方 RPC");
        assert.ok(frameUsagePaths.length >= 1, "未触发 /usage 兜底");
        assert.ok(
          frameUsagePaths.every((entry) => entry === "/u/1/usage"),
          "请求了其他账号：" + frameUsagePaths.join(","),
        );
        const frameDiagnostics = await frameApp.evaluate(
          () => window.__gqc.dump().diagnostics,
        );
        assert.ok(frameDiagnostics.usageFrameAttempts >= 1, "未走同源 iframe 兜底");
        assert.equal(frameDiagnostics.usageFrameParsed, true);
        assert.equal(framePopupCount, 0, "静默兜底不得打开标签页");
        assert.equal(frameContext.pages().length, 1, "静默兜底不得留下多余页面");
        assert.equal(frameApp.url(), "https://gemini.google.com/u/1/app");
        console.log(
          "静默 iframe 兜底通过：RPC 503 时仍取到 12% / 68%，无 popup、无跳转。",
        );
      } finally {
        await frameContext.close();
      }
    }

    // 场景 C：RPC 与同源 iframe 都失效。自动同步保持静默失败，
    // 手动刷新才在后台标签页里读同一份官方页面文本，回传后自动关闭。
    {
      const helperUsagePaths = [];
      let helperPopupCount = 0;
      const helperContext = await browser.newContext();
      try {
        await helperContext.route("https://gemini.google.com/**", (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.pathname.endsWith("/batchexecute")) {
            return route.fulfill({ status: 503, body: "Unavailable" });
          }
          if (url.pathname.endsWith("/usage")) {
            helperUsagePaths.push(url.pathname);
            // 只有顶层后台标签页渲染用量文本；同源 iframe 与 GET 探测只拿到空壳。
            const isTopLevelDocument =
              request.isNavigationRequest() && request.frame().parentFrame() === null;
            return route.fulfill({
              contentType: "text/html",
              body: isTopLevelDocument ? usageHtml : emptyHtml,
            });
          }
          return route.fulfill({ contentType: "text/html", body: emptyHtml });
        });
        await helperContext.addInitScript(() => {
          window.WIZ_global_data = { SNlM0e: "test-token", cfb2h: "build", FdrFJe: "session" };
        });
        await helperContext.addInitScript({ content: topFrameOnlySource });
        const helperApp = await helperContext.newPage();
        helperApp.on("popup", () => (helperPopupCount += 1));
        await helperApp.goto("https://gemini.google.com/u/1/app");
        // 先让自动同步跑完并把 iframe 判为不可用：只有此时手动点击才值得占位。
        const blockedDeadline = Date.now() + 60000;
        let blocked = null;
        while (Date.now() < blockedDeadline) {
          blocked = await helperApp.evaluate(() => ({
            blocked: window.__gqc.dump().diagnostics.usageFrameBlocked,
            syncing: window.__gqc.state.isSyncing,
            error: window.__gqc.state.lastError,
          }));
          if (blocked.blocked === true && blocked.syncing === false) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(blocked.blocked, true, "同源 iframe 未被判定为不可用");
        assert.match(blocked.error, /503/, "RPC 失败原因应保留在状态里");
        assert.equal(helperPopupCount, 0, "自动同步不得打开标签页");
        await helperApp.evaluate(() => {
          const refresh = document.querySelector(
            '.gc-btn-icon[title="立即同步官方最新用量与重置时间"]',
          );
          refresh.click();
          refresh.click();
          refresh.click();
        });
        const helperState = await waitForState(helperApp, { fiveHour: 12, weekly: 68 }, 60000);
        assert.equal(helperState.error, "", "后台页回传成功后应清除错误状态");
        // 后台页写完同步桥后自行关闭，给它一个短暂的收尾窗口。
        const closeDeadline = Date.now() + 15000;
        while (helperContext.pages().length > 1 && Date.now() < closeDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(helperPopupCount, 1, "手动刷新只占一个后台标签页");
        assert.ok(helperUsagePaths.length >= 1, "未请求官方 /usage");
        assert.ok(
          helperUsagePaths.every((entry) => entry === "/u/1/usage"),
          "请求了其他账号：" + helperUsagePaths.join(","),
        );
        assert.equal(helperContext.pages().length, 1, "后台用量页未自动关闭");
        assert.equal(helperApp.url(), "https://gemini.google.com/u/1/app");
        console.log(
          "手动兜底通过：RPC 与 iframe 均失效时，后台 /u/1/usage 回传 12% / 68% 并自动关闭。",
        );
      } finally {
        await helperContext.close();
      }
    }

    // 场景 D：/app 上没有 /u/<n> 前缀。裸 /usage 就是当前登录账号的用量页，
    // 探测直接取数；不应因为「不知道前缀」而整条链路失效，也不应猜测 RPC 端点。
    {
      const bareUsagePaths = [];
      let bareRpcCount = 0;
      let barePopupCount = 0;
      const bareContext = await browser.newContext();
      try {
        await bareContext.route("https://gemini.google.com/**", (route) => {
          const url = new URL(route.request().url());
          if (url.pathname.endsWith("/batchexecute")) {
            bareRpcCount += 1;
            return route.fulfill({ status: 500, body: "should not happen" });
          }
          if (url.pathname.endsWith("/usage")) {
            bareUsagePaths.push(url.pathname);
            return route.fulfill({ contentType: "text/html", body: usageHtml });
          }
          return route.fulfill({ contentType: "text/html", body: emptyHtml });
        });
        await bareContext.addInitScript({ content: topFrameOnlySource });
        const bareApp = await bareContext.newPage();
        bareApp.on("popup", () => (barePopupCount += 1));
        await bareApp.goto("https://gemini.google.com/app");
        const bareState = await waitForState(bareApp, { fiveHour: 12, weekly: 68 }, 30000);
        assert.equal(bareRpcCount, 0, "无账号前缀时不应猜测 RPC 端点");
        assert.deepEqual(bareUsagePaths, ["/usage"], "应只请求当前账号的裸 /usage");
        const bareDiagnostics = await bareApp.evaluate(
          () => window.__gqc.dump().diagnostics,
        );
        assert.equal(bareDiagnostics.usageFrameAttempts, 0, "探测已成功，不应再开 iframe");
        assert.equal(barePopupCount, 0);
        assert.equal(bareContext.pages().length, 1);
        assert.equal(bareApp.url(), "https://gemini.google.com/app");
        assert.equal(bareState.error, "");
        console.log("无前缀静默探测通过：/app 下直接 GET /usage 取到 12% / 68%。");
      } finally {
        await bareContext.close();
      }
    }
    // 场景 F：/app 上裸 /usage 由 Google 302 到 /u/2/usage。探测先拿到空壳，
    // 但这次解析给出了账号索引；随后的 iframe 必须改用 /u/2，不能退回裸 /usage
    // 或继续按旧账号请求——否则探测知道的账号到 iframe 阶段就丢了。
    {
      const prefixHits = [];
      const prefixServer = http.createServer((request, response) => {
        const pathname = new URL(request.url, "http://127.0.0.1").pathname;
        prefixHits.push(pathname);
        if (pathname === "/usage") {
          response.writeHead(302, { location: "/u/2/usage" });
          response.end();
          return;
        }
        if (pathname === "/u/2/usage") {
          // 探测的 fetch 拿到空壳；同源 iframe 的真实渲染才带用量文本。
          const isIframe = request.headers["sec-fetch-dest"] === "iframe";
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end(isIframe ? usageHtml : emptyHtml);
          return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(emptyHtml);
      });
      await new Promise((resolve) => prefixServer.listen(0, "127.0.0.1", resolve));
      const prefixPort = prefixServer.address().port;
      const prefixContext = await browser.newContext();
      try {
        await prefixContext.addInitScript({ content: topFrameOnlySource });
        const prefixApp = await prefixContext.newPage();
        let prefixPopupCount = 0;
        prefixApp.on("popup", () => (prefixPopupCount += 1));
        await prefixApp.goto(`http://127.0.0.1:${prefixPort}/app`);
        const prefixState = await waitForState(
          prefixApp,
          { fiveHour: 12, weekly: 68 },
          60000,
        );
        const prefixSnapshot = await prefixApp.evaluate(() => ({
          usagePage: window.__gqc.state.usagePageStatus,
          diagnostics: window.__gqc.dump().diagnostics,
        }));
        assert.equal(
          prefixSnapshot.usagePage.assumedAccount,
          true,
          "未标记默认账号解析",
        );
        assert.equal(prefixSnapshot.usagePage.resolvedPrefix, "/u/2");
        assert.equal(
          prefixSnapshot.diagnostics.usageFrameParsed,
          true,
          "iframe 未接管探测到的账号",
        );
        assert.ok(prefixHits.includes("/usage"), "未请求裸 /usage");
        assert.ok(!prefixHits.includes("/u/1/usage"), "探测后仍按旧账号请求");
        assert.equal(prefixState.error, "");
        assert.equal(prefixPopupCount, 0);
        assert.equal(prefixContext.pages().length, 1);
        assert.equal(prefixApp.url(), `http://127.0.0.1:${prefixPort}/app`);
        console.log(
          "默认账号解析通过：/app 的裸 /usage 302 → /u/2/usage 后，iframe 用 /u/2 取到 12% / 68%。",
        );
      } finally {
        await prefixContext.close();
        await new Promise((resolve) => {
          prefixServer.close(() => resolve());
          prefixServer.closeAllConnections?.();
        });
      }
    }

    // 场景 G：自动同步已失败、iframe 处于冷却期；随后官方 RPC 恢复。
    // 手动点击必须在同步段预留后台页，但 RPC 成功时预留页要立即关闭，
    // 且不得再请求 /usage。
    {
      const recoveredUsagePaths = [];
      let recoveredRpcHealthy = false;
      let recoveredPopupCount = 0;
      const recoveredContext = await browser.newContext();
      try {
        await recoveredContext.route("https://gemini.google.com/**", (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.pathname.endsWith("/batchexecute")) {
            if (!recoveredRpcHealthy) {
              return route.fulfill({ status: 503, body: "Unavailable" });
            }
            const now = Date.now();
            const payload = [
              2,
              [
                [2400, 0.21, 1, [[Math.floor(now / 1000) + 7200, 0]]],
                [48106, 0.68, 2, [[Math.floor(now / 1000) + 259200, 0]]],
              ],
              false,
            ];
            const frame = JSON.stringify([
              ["wrb.fr", "jSf9Qc", JSON.stringify(payload), null],
            ]);
            return route.fulfill({ contentType: "application/json", body: frame });
          }
          if (url.pathname.endsWith("/usage")) {
            recoveredUsagePaths.push(url.pathname);
            return route.fulfill({ contentType: "text/html", body: emptyHtml });
          }
          return route.fulfill({ contentType: "text/html", body: emptyHtml });
        });
        await recoveredContext.addInitScript(() => {
          window.WIZ_global_data = { SNlM0e: "test-token", cfb2h: "build", FdrFJe: "session" };
        });
        await recoveredContext.addInitScript({ content: topFrameOnlySource });
        const recoveredApp = await recoveredContext.newPage();
        recoveredApp.on("popup", () => (recoveredPopupCount += 1));
        await recoveredApp.goto("https://gemini.google.com/u/1/app");
        const recoveryDeadline = Date.now() + 60000;
        let recoveryBlocked = null;
        while (Date.now() < recoveryDeadline) {
          recoveryBlocked = await recoveredApp.evaluate(() => ({
            blocked: window.__gqc.dump().diagnostics.usageFrameBlocked,
            syncing: window.__gqc.state.isSyncing,
            error: window.__gqc.state.lastError,
          }));
          if (recoveryBlocked.blocked === true && recoveryBlocked.syncing === false) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(recoveryBlocked.blocked, true, "同源 iframe 未被判定为不可用");
        assert.match(recoveryBlocked.error, /503/, "RPC 失败原因应保留在状态里");
        assert.equal(recoveredPopupCount, 0, "自动同步不得打开标签页");
        const usageHitsBeforeClick = recoveredUsagePaths.length;
        recoveredRpcHealthy = true;
        await recoveredApp.evaluate(() => {
          document
            .querySelector('.gc-btn-icon[title="立即同步官方最新用量与重置时间"]')
            .click();
        });
        const recoveredState = await waitForState(
          recoveredApp,
          { fiveHour: 21, weekly: 68 },
          60000,
        );
        assert.equal(recoveredState.error, "", "RPC 恢复后应清除错误状态");
        assert.equal(recoveredPopupCount, 1, "手动刷新应预留一个后台页");
        const closeDeadline = Date.now() + 15000;
        while (
          recoveredContext.pages().length > 1 &&
          Date.now() < closeDeadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(
          recoveredContext.pages().length,
          1,
          "RPC 成功时预留的后台页未关闭",
        );
        assert.equal(
          recoveredUsagePaths.length,
          usageHitsBeforeClick,
          "RPC 成功后仍请求了 /usage",
        );
        assert.equal(recoveredApp.url(), "https://gemini.google.com/u/1/app");
        console.log(
          "预留页回收通过：自动失败后 RPC 恢复，手动刷新关闭空后台页且不再请求 /usage。",
        );
      } finally {
        await recoveredContext.close();
      }
    }

    // 场景 E：真实 302。Playwright 的 route.fulfill 不会让浏览器跟随重定向
    // （实测直接连接失败），因此用本地 HTTP 服务产生真实的重定向链：
    // /u/1/usage → /u/2/usage。目标页面能解析出用量，但账号索引不同，
    // 探测与 iframe 都必须丢弃正文，且不得写入缓存。
    {
      const redirectHits = [];
      const redirectServer = http.createServer((request, response) => {
        const pathname = new URL(request.url, "http://127.0.0.1").pathname;
        redirectHits.push(pathname);
        if (pathname === "/u/1/usage") {
          response.writeHead(302, { location: "/u/2/usage" });
          response.end();
          return;
        }
        if (pathname === "/u/2/usage") {
          response.writeHead(200, {
            "content-type": "text/html; charset=utf-8",
          });
          response.end(usageHtml);
          return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(emptyHtml);
      });
      await new Promise((resolve) =>
        redirectServer.listen(0, "127.0.0.1", resolve),
      );
      const redirectPort = redirectServer.address().port;
      const redirectContext = await browser.newContext();
      try {
        await redirectContext.addInitScript({ content: topFrameOnlySource });
        const redirectApp = await redirectContext.newPage();
        await redirectApp.goto(
          `http://127.0.0.1:${redirectPort}/u/1/app`,
        );
        const redirectDeadline = Date.now() + 30000;
        let redirectSnapshot = null;
        while (Date.now() < redirectDeadline) {
          redirectSnapshot = await redirectApp.evaluate(() => ({
            syncing: window.__gqc.state.isSyncing,
            usagePage: window.__gqc.state.usagePageStatus,
            diagnostics: window.__gqc.dump().diagnostics,
          }));
          if (
            redirectSnapshot.syncing === false &&
            redirectSnapshot.usagePage !== null
          ) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(redirectSnapshot.usagePage, "探测未记录 /usage 体检结果");
        assert.equal(redirectSnapshot.usagePage.redirected, true);
        assert.equal(redirectSnapshot.usagePage.sameAccount, false);
        assert.ok(
          redirectSnapshot.usagePage.finalUrl.endsWith("/u/2/usage"),
          "最终地址异常：" + redirectSnapshot.usagePage.finalUrl,
        );
        assert.equal(
          redirectSnapshot.diagnostics.usageFrameRedirected,
          true,
          "iframe 未识别跨账号重定向",
        );
        assert.equal(redirectSnapshot.diagnostics.usageFrameParsed, false);
        const redirectState = await redirectApp.evaluate(() => ({
          fiveHour: window.__gqc.state.fiveHour.usedPct,
          weekly: window.__gqc.state.weekly.usedPct,
          cache: localStorage.getItem(window.__gqc._test.officialCacheKey()),
        }));
        assert.equal(redirectState.fiveHour, null, "跨账号正文写入了 5H");
        assert.equal(redirectState.weekly, null, "跨账号正文写入了 7D");
        assert.equal(redirectState.cache, null, "跨账号正文写入了缓存");
        assert.ok(redirectHits.includes("/u/2/usage"), "未跟随真实重定向");
        assert.equal(redirectContext.pages().length, 1);
        assert.equal(
          redirectApp.url(),
          `http://127.0.0.1:${redirectPort}/u/1/app`,
        );
        console.log(
          "跨账号重定向拦截通过：302 → /u/2/usage 的正文未写入状态或缓存。",
        );
      } finally {
        await redirectContext.close();
        await new Promise((resolve) => {
          redirectServer.close(() => resolve());
          redirectServer.closeAllConnections?.();
        });
      }
    }

    console.log(`连续更新审计（每形态 1000 次）：${JSON.stringify(audit)}`);

    console.log(
      `布局回归通过：${ORNAMENT_KEYS.length} 装饰 × ${PROGRESS_KEYS.length} 进度 × ${USED_SAMPLES.length} 用量，` +
        `胶囊宽度恒为 ${baseWidth}px，槽位恒为 ${SLOT_WIDTH_PX}px。`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
