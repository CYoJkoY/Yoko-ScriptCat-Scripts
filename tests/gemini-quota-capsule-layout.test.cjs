#!/usr/bin/env node
// Gemini Quota Capsule 布局回归：验证切换指示器形态时胶囊宽度（长边）恒定。
//
// 运行方式（PowerShell）：
//   $env:GQC_PLAYWRIGHT_MODULE='<本机 playwright 模块目录>'
//   node tests/gemini-quota-capsule-layout.test.cjs
// 未安装 Playwright 时本测试自动跳过（退出码 0），不影响解析器回归。

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
      // 模块不存在时继续尝试下一个候选，全部失败则返回 null。
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
    console.log("跳过布局回归：未找到 Playwright，请设置 GQC_PLAYWRIGHT_MODULE 指向本机安装。");
    return;
  }

  const originalSource = fs.readFileSync(SCRIPT_PATH, "utf8");
  // 只建 DOM、不做网络同步，避免测试依赖真实 Gemini 页面与登录态。
  const source = originalSource.replace("  bootstrap();", "  createDOM();");
  assert.notEqual(source, originalSource, "未找到 bootstrap() 调用，脚本入口结构可能已变化");

  const browser = await launchBrowser(playwright.chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
