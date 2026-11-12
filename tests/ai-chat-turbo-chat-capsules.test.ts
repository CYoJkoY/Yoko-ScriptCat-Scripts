// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  VF_TOKEN_END,
  VF_TOKEN_START,
} from "../scripts/ai-chat-turbo-engine/src/config";
import { createEngineState } from "../scripts/ai-chat-turbo-engine/src/state";
import type { ElementFactory } from "../scripts/ai-chat-turbo-engine/src/ui/code-blocks";
import {
  createChatCapsuleUtils,
  parseChatVirtualFileMessage,
  type ChatCapsuleUtils,
} from "../scripts/ai-chat-turbo-engine/src/ui/chat-capsules";
import {
  TEXT_PREVIEW_MODAL_ID,
  closeTextPreview,
} from "../scripts/ai-chat-turbo-engine/src/ui/text-preview";

function createTestElement<Tag extends keyof HTMLElementTagNameMap = "div">(
  tag: Tag,
  attrs: Readonly<Record<string, string | EventListener>> = {},
  children: readonly (string | Node)[] = [],
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "function") {
      node.addEventListener(key.replace(/^on/, ""), value);
      continue;
    }
    if (key === "className") {
      node.className = value;
      continue;
    }
    node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

const el: ElementFactory = createTestElement;

const FENCE = "```";

interface FileSpec {
  name: string;
  lines: number;
  bytes: number;
  content: string;
}

function token(file: FileSpec): string {
  return `${VF_TOKEN_START}${file.name}|${file.lines}|${file.bytes}${VF_TOKEN_END}`;
}

/** Mirrors how the composer wraps each virtual file inside one message. */
function buildMessage(prompt: string, files: readonly FileSpec[]): string {
  const blocks = files.map(
    (file) =>
      `\n\n${FENCE}text\n${token(file)}\n${file.content}\n${FENCE}`,
  );
  return (prompt || "请查阅并分析以下文本内容：") + blocks.join("\n");
}

function buildTurn(message: string): HTMLElement {
  const turn = document.createElement("div");
  turn.className = "turn";
  const block = document.createElement("p");
  block.textContent = message;
  turn.append(block);
  document.body.append(turn);
  return turn;
}

describe("parseChatVirtualFileMessage", () => {
  it("reads the prompt and keeps a fenced payload intact", () => {
    const parsed = parseChatVirtualFileMessage(
      buildMessage("总结这份日志", [
        {
          name: "server.log",
          lines: 4,
          bytes: 2048,
          content: "first\n```js\nconst a = 1;\n```",
        },
      ]),
    );

    expect(parsed?.prompt).toBe("总结这份日志");
    expect(parsed?.files).toHaveLength(1);
    expect(parsed?.files[0]).toMatchObject({
      name: "server.log",
      lineCount: 4,
      sizeBytes: 2048,
      content: "first\n```js\nconst a = 1;\n```",
    });
  });

  it("splits every file of one message without leaving wrapper fences", () => {
    const parsed = parseChatVirtualFileMessage(
      buildMessage("对比这两份配置", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
        { name: "b.txt", lines: 1, bytes: 20, content: "beta" },
      ]),
    );

    expect(parsed?.prompt).toBe("对比这两份配置");
    expect(parsed?.files.map((file) => file.name)).toEqual(["a.txt", "b.txt"]);
    expect(parsed?.files.map((file) => file.content)).toEqual(["alpha", "beta"]);
  });

  it("drops the placeholder prompt the composer writes on its own", () => {
    const parsed = parseChatVirtualFileMessage(
      buildMessage("", [{ name: "only.txt", lines: 2, bytes: 30, content: "x\ny" }]),
    );

    expect(parsed?.prompt).toBe("");
    expect(parsed?.files[0]?.content).toBe("x\ny");
  });

  it("reads the prompt when the host splits the message into blocks", () => {
    const file: FileSpec = {
      name: "server.log",
      lines: 4,
      bytes: 2048,
      content: "first\n```js\nconst a = 1;\n```",
    };
    const prompt = document.createElement("p");
    prompt.textContent = "总结这份日志";
    const block = document.createElement("pre");
    block.textContent = `${FENCE}text\n${token(file)}\n${file.content}\n${FENCE}`;
    const turn = document.createElement("div");
    turn.append(prompt, block);

    // Joined text loses the newline the composer writes before the fence.
    const parsed = parseChatVirtualFileMessage(turn.textContent ?? "");

    expect(parsed?.prompt).toBe("总结这份日志");
    expect(parsed?.files[0]?.content).toBe(file.content);
  });

  it("ignores a message that carries no token", () => {
    expect(parseChatVirtualFileMessage("just a normal question")).toBeNull();
  });
});

describe("sent virtual file capsules", () => {
  let capsules: ChatCapsuleUtils;

  beforeEach(() => {
    document.body.replaceChildren();
    capsules = createChatCapsuleUtils({
      el,
      withSelfMutation: (task) => task(),
      state: createEngineState(),
    });
  });

  afterEach(() => {
    capsules.reset();
    closeTextPreview();
    document.body.replaceChildren();
  });

  it("replaces the sent payload with a capsule that opens a preview", () => {
    const message = buildMessage("总结这份日志", [
      {
        name: "server.log",
        lines: 2,
        bytes: 2048,
        content: "第一行\n第二行",
      },
    ]);
    const turn = buildTurn(message);
    capsules.collapseInChatFileBlocks(turn);

    const row = turn.nextElementSibling;
    expect(row?.classList.contains("ai-turbo-chat-file-row")).toBe(true);
    const buttons = Array.from(
      row?.querySelectorAll<HTMLButtonElement>("button.ai-turbo-chat-capsule") ??
        [],
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toContain("server.log");
    expect(buttons[0]?.textContent).toContain("查看");
    expect(buttons[0]?.getAttribute("aria-label")).toContain("server.log");

    const prompt = turn.querySelector(".ai-turbo-chat-user-prompt");
    expect(prompt?.textContent).toBe("总结这份日志");
    const hidden = turn.querySelector("p");
    expect(hidden?.classList.contains("ai-turbo-chat-folded-target")).toBe(true);
    expect(hidden?.style.getPropertyValue("display")).toBe("none");

    buttons[0]?.click();

    const modal = document.getElementById(TEXT_PREVIEW_MODAL_ID);
    expect(modal).not.toBeNull();
    expect(
      modal?.querySelector(".ai-turbo-text-preview-body")?.textContent,
    ).toBe("第一行\n第二行");
    expect(
      modal?.querySelector('[role="dialog"]')?.getAttribute("aria-modal"),
    ).toBe("true");
    expect(modal?.textContent).toContain("server.log");
  });

  it("opens the capsule that was clicked when one turn sent several files", () => {
    const turn = buildTurn(
      buildMessage("看看这两份", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
        { name: "b.txt", lines: 1, bytes: 20, content: "beta" },
      ]),
    );
    capsules.collapseInChatFileBlocks(turn);

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        ".ai-turbo-chat-file-row button.ai-turbo-chat-capsule",
      ),
    );
    expect(buttons).toHaveLength(2);
    buttons[1]?.click();

    expect(
      document.querySelector(
        `#${TEXT_PREVIEW_MODAL_ID} .ai-turbo-text-preview-body`,
      )?.textContent,
    ).toBe("beta");
  });

  it("switches a sent message between the capsules and its plain text", () => {
    const turn = buildTurn(
      buildMessage("还原成普通消息", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
      ]),
    );
    capsules.collapseInChatFileBlocks(turn);

    const hidden = turn.querySelector<HTMLParagraphElement>("p");
    const prompt = turn.querySelector<HTMLElement>(
      ".ai-turbo-chat-user-prompt",
    );
    const toggle = document.querySelector<HTMLButtonElement>(
      ".ai-turbo-chat-file-toggle",
    );
    if (!hidden || !prompt || !toggle) throw new Error("Missing capsule toggle");

    expect(toggle.textContent).toBe("展开原文");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(hidden.style.getPropertyValue("display")).toBe("none");

    toggle.click();

    expect(toggle.textContent).toBe("收起为文件");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(hidden.style.getPropertyValue("display")).toBe("");
    expect(hidden.style.getPropertyValue("contain")).toBe("");
    expect(prompt.style.getPropertyValue("display")).toBe("none");

    toggle.click();

    expect(toggle.textContent).toBe("展开原文");
    expect(hidden.style.getPropertyValue("display")).toBe("none");
    expect(prompt.style.getPropertyValue("display")).toBe("");
  });

  it("keeps an expanded message expanded while the host stays stable", () => {
    const turn = buildTurn(
      buildMessage("保持展开", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
      ]),
    );
    capsules.collapseInChatFileBlocks(turn);
    const hidden = turn.querySelector("p");
    const toggle = document.querySelector<HTMLButtonElement>(
      ".ai-turbo-chat-file-toggle",
    );
    if (!hidden || !toggle) throw new Error("Missing capsule toggle");
    toggle.click();

    capsules.sweep([turn]);

    expect(hidden.style.getPropertyValue("display")).toBe("");
    expect(document.querySelectorAll(".ai-turbo-chat-file-row")).toHaveLength(1);
    expect(toggle.textContent).toBe("收起为文件");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes the preview on Escape and on a backdrop click", () => {
    const turn = buildTurn(
      buildMessage("再读一遍", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
      ]),
    );
    capsules.collapseInChatFileBlocks(turn);
    const capsule = document.querySelector<HTMLButtonElement>(
      ".ai-turbo-chat-capsule",
    );

    capsule?.click();
    const dialog = document.querySelector<HTMLElement>(
      ".ai-turbo-text-preview-dialog",
    );
    dialog?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(document.getElementById(TEXT_PREVIEW_MODAL_ID)).toBeNull();

    capsule?.click();
    const backdrop = document.getElementById(TEXT_PREVIEW_MODAL_ID);
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById(TEXT_PREVIEW_MODAL_ID)).toBeNull();
  });

  it("hides its capsule row while the turn is dehydrated", () => {
    const turn = buildTurn(
      buildMessage("收起这轮", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
      ]),
    );
    capsules.collapseInChatFileBlocks(turn);
    const row = turn.nextElementSibling;
    if (!(row instanceof HTMLElement)) throw new Error("Missing capsule row");

    turn.classList.add("ai-turbo-dehydrated");
    capsules.sweep([turn]);
    expect(row.style.getPropertyValue("display")).toBe("none");

    turn.classList.remove("ai-turbo-dehydrated");
    capsules.sweep([turn]);
    expect(row.style.getPropertyValue("display")).toBe("");
  });

  it("repairs the capsule after the platform re-renders the turn", () => {
    const message = buildMessage("重绘一次", [
      { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
    ]);
    const turn = buildTurn(message);
    capsules.collapseInChatFileBlocks(turn);

    const fresh = document.createElement("p");
    fresh.textContent = message;
    turn.querySelector("p")?.replaceWith(fresh);

    capsules.sweep([turn]);

    expect(fresh.classList.contains("ai-turbo-chat-folded-target")).toBe(true);
    expect(fresh.style.getPropertyValue("display")).toBe("none");
    expect(document.querySelectorAll(".ai-turbo-chat-file-row")).toHaveLength(1);
  });

  it("drops the capsule row when the turn leaves the transcript", () => {
    const turn = buildTurn(
      buildMessage("离开页面", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
      ]),
    );
    capsules.collapseInChatFileBlocks(turn);

    turn.remove();
    capsules.sweep([]);

    expect(document.querySelector(".ai-turbo-chat-file-row")).toBeNull();
  });

  it("restores the sent text on reset", () => {
    const turn = buildTurn(
      buildMessage("还原我", [
        { name: "a.txt", lines: 1, bytes: 10, content: "alpha" },
      ]),
    );
    capsules.collapseInChatFileBlocks(turn);
    const hidden = turn.querySelector("p");

    capsules.reset();

    expect(document.querySelector(".ai-turbo-chat-file-row")).toBeNull();
    expect(hidden?.classList.contains("ai-turbo-chat-folded-target")).toBe(
      false,
    );
    expect(hidden?.style.getPropertyValue("display")).toBe("");
  });
});

