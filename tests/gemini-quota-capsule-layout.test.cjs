#!/usr/bin/env node
// Gemini Quota Capsule 布局回归：验证组件样式切换、自定义资源与胶囊宽度恒定。
//
// 运行方式（PowerShell）：
//   $env:GQC_PLAYWRIGHT_MODULE='<本机 playwright 模块目录>'
//   node tests/gemini-quota-capsule-layout.test.cjs
// 缺少 Playwright 时失败，避免把未执行的浏览器验证误报为通过。

const fs = require("node:fs");
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
          if (failRpc) return route.fulfill({ status: 503, body: "Unavailable" });
          assert.equal(url.pathname, "/u/1/_/BardChatUi/data/batchexecute");
          assert.equal(url.searchParams.get("source-path"), "/u/1/usage");
          const params = new URLSearchParams(request.postData());
          assert.equal(params.get("at"), "test-token");
          assert.deepEqual(JSON.parse(params.get("f.req")), [
            [["jSf9Qc", [], null, "generic"]],
          ]);
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
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><html><body></body></html>",
        });
      });
      await context.addInitScript(() => {
        window.WIZ_global_data = {
          SNlM0e: "test-token",
          cfb2h: "build",
          FdrFJe: "session",
        };
      });
      await context.addInitScript({ content: originalSource });
      const app = await context.newPage();
      app.on("popup", () => (popupCount += 1));
      await app.goto("https://gemini.google.com/u/1/app");
      await app.waitForFunction(() => window.__gqc.state.fiveHour.usedPct === 12);
      assert.equal(rpcCount, 1, "启动时自动获取，无需点击");
      used = 23;
      await app.evaluate(() => {
        window.__gqc.sync();
        window.__gqc.sync();
        window.__gqc.sync();
      });
      await app.waitForFunction(
        () => window.__gqc.state.isSyncing === false && window.__gqc.state.fiveHour.usedPct === 23,
      );
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
      console.log(
        "静默刷新链路通过：启动自动获取、手动连点去重、周期自动更新，无 popup 或 Usage 页面请求。",
      );
    } finally {
      await context.close();
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
