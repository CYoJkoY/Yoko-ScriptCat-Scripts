import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";

const source = await readFile(new URL("../scripts/heybox-up.js", import.meta.url), "utf8");
const tick = String.fromCharCode(96);
const navCssStart = source.indexOf("const NAV_CSS = " + tick);
const navCssEnd = source.indexOf("\n  " + tick + ";", navCssStart);
assert.ok(navCssStart >= 0 && navCssEnd > navCssStart, "navigation CSS must exist");
const navCss = source.slice(navCssStart + "const NAV_CSS = ".length + 1, navCssEnd)
  .replaceAll(String.fromCharCode(36) + "{NAV_ID}", "heybox-up-nav")
  .replaceAll(String.fromCharCode(36) + "{NAV_STATIC_CLASS}", "heybox-up-nav-static");

const iconNames = ["home", "community", "favour", "article"];
const browserCandidates = [
  process.env.HEYBOX_CHROME_PATH,
  process.env.CHROME_PATH,
  ...(process.env.ProgramFiles === undefined ? [] : [
    join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
  ]),
  ...(process.env["ProgramFiles(x86)"] === undefined ? [] : [
    join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe"),
    join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
  ]),
  ...(process.env.LOCALAPPDATA === undefined ? [] : [
    join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  ]),
].filter((candidate) => typeof candidate === "string" && candidate.length > 0);

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }
  return null;
}

async function waitFor(predicate, timeoutMs, message) {
  const expiresAt = Date.now() + timeoutMs;
  while (Date.now() < expiresAt) {
    const value = await predicate();
    if (value !== null && value !== undefined && value !== false) return value;
    await delay(50);
  }
  throw new Error(message);
}

function connectCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id !== "number") return;
    const request = pending.get(message.id);
    if (request === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  socket.addEventListener("close", () => {
    for (const request of pending.values()) request.reject(new Error("CDP connection closed"));
    pending.clear();
  });

  return {
    socket,
    opened,
    send(method, params = {}) {
      const id = ++nextId;
      const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return response;
    },
  };
}

function createPage() {
  const links = iconNames.map((name) => "<a class=\"hbu-nav-link\" href=\"#" + name + "\"><svg viewBox=\"0 0 24 24\"><g class=\"hbu-ico-anim hbu-ico-" + name + "\"><path d=\"M3 3h18v18H3z\"></path></g></svg><span>" + name + "</span></a>").join("");
  return "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + navCss + "</style><style>" +
    "body { margin: 0; padding: 24px; } #heybox-up-nav { width: max-content; } .hbu-nav-link { height: 64px; } .hbu-nav-link svg { overflow: visible; }" +
    "</style></head><body><nav id=\"heybox-up-nav\">" + links + "</nav><script>" +
    "window.animationEvents = []; for (const eventType of ['animationstart', 'animationend']) { document.addEventListener(eventType, (event) => { if (event.target.matches('.hbu-ico-anim')) window.animationEvents.push({ type: event.type, name: event.animationName, time: performance.now() }); }, true); }" +
    "document.addEventListener('click', (event) => event.preventDefault());</script></body></html>";
}

test("pressing each navigation link starts a fresh animation after hover completes", async (t) => {
  const browserPath = await findBrowser();
  if (browserPath === null) {
    t.skip("Set HEYBOX_CHROME_PATH to a Chromium-based browser to run this browser-level check");
    return;
  }

  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(createPage());
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const pageUrl = "http://127.0.0.1:" + address.port + "/";
  const profileDirectory = await mkdtemp(join(tmpdir(), "heybox-nav-motion-"));
  const browserProcess = spawn(browserPath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--disable-background-networking",
    "--disable-extensions",
    "--user-data-dir=" + profileDirectory,
    pageUrl,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let browserError = "";
  let browserSpawnError;
  browserProcess.on("error", (error) => { browserSpawnError = error; });
  browserProcess.stderr.setEncoding("utf8");
  browserProcess.stderr.on("data", (chunk) => { browserError += chunk; });
  let pageCdp;
  let browserCdp;

  try {
    const activePortFile = join(profileDirectory, "DevToolsActivePort");
    const activePortContents = await waitFor(async () => {
      if (browserSpawnError !== undefined) {
        throw new Error("Chromium could not start: " + browserSpawnError.message);
      }
      if (browserProcess.exitCode !== null) {
        throw new Error("Chromium exited before starting (code " + browserProcess.exitCode + "): " + browserError);
      }
      try {
        return await readFile(activePortFile, "utf8");
      } catch {
        return null;
      }
    }, 10000, "Chromium did not expose its debugging port: " + browserError);
    const portText = activePortContents.trim().split(/\s+/)[0];
    const debuggerBase = "http://127.0.0.1:" + portText;
    const browserVersion = await waitFor(async () => {
      try {
        const response = await fetch(debuggerBase + "/json/version");
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }, 10000, "Chromium debugging endpoint did not respond");
    browserCdp = connectCdp(browserVersion.webSocketDebuggerUrl);
    await browserCdp.opened;
    const targets = await waitFor(async () => {
      const response = await fetch(debuggerBase + "/json/list");
      if (!response.ok) return null;
      const pages = (await response.json()).filter((target) => target.type === "page" && target.url === pageUrl);
      return pages.length > 0 ? pages : null;
    }, 10000, "Chromium did not open the local regression page");
    pageCdp = connectCdp(targets[0].webSocketDebuggerUrl);
    await pageCdp.opened;
    await pageCdp.send("Page.enable");
    await pageCdp.send("Runtime.enable");
    await pageCdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await waitFor(async () => {
      const result = await pageCdp.send("Runtime.evaluate", { expression: "document.readyState === 'complete'", returnByValue: true });
      return result.result.value;
    }, 10000, "Regression page did not finish loading");

    for (const iconName of iconNames) {
      const boundsResult = await pageCdp.send("Runtime.evaluate", {
        expression: "(() => { const rect = document.querySelector('.hbu-ico-" + iconName + "').closest('a').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()",
        returnByValue: true,
      });
      const { x, y } = boundsResult.result.value;
      await pageCdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await delay(700);
      const completedHoverResult = await waitFor(async () => {
        const result = await pageCdp.send("Runtime.evaluate", {
          expression: "window.animationEvents.some((event) => event.type === 'animationend' && event.name === 'hbu-nav-" + iconName + "')",
          returnByValue: true,
        });
        return result.result.value;
      }, 1000, iconName + " hover animation did not finish before pressing");
      assert.equal(completedHoverResult, true, iconName + " hover animation should finish before pressing");
      const eventCountResult = await pageCdp.send("Runtime.evaluate", { expression: "window.animationEvents.length", returnByValue: true });
      const priorEventCount = eventCountResult.result.value;
      await pageCdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1 });
      const pressAnimationStarted = await waitFor(async () => {
        const result = await pageCdp.send("Runtime.evaluate", {
          expression: "window.animationEvents.slice(" + priorEventCount + ").some((event) => event.type === 'animationstart' && event.name === 'hbu-nav-press')",
          returnByValue: true,
        });
        return result.result.value;
      }, 1000, iconName + " press did not start its distinct animation");
      assert.equal(pressAnimationStarted, true, iconName + " should animate again when pressed after hover completes");
      await pageCdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0 });
      await pageCdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
    }
  } finally {
    pageCdp?.socket.close();
    if (browserCdp !== undefined) {
      try {
        await browserCdp.send("Browser.close");
      } catch {
        // The browser may already have exited after its page target was closed.
      }
      browserCdp.socket.close();
    }
    if (browserProcess.pid !== undefined && browserProcess.exitCode === null && browserProcess.signalCode === null) {
      const exited = await Promise.race([
        new Promise((resolve) => browserProcess.once("exit", () => resolve(true))),
        delay(3000).then(() => false),
      ]);
      if (!exited) {
        browserProcess.kill();
        await new Promise((resolve) => browserProcess.once("exit", resolve));
      }
    }
    await new Promise((resolve) => server.close(resolve));
    await rm(profileDirectory, { recursive: true, force: true });
  }
});
