// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { PLATFORMS } from "../scripts/ai-chat-turbo-engine/src/config";
import { createComposerUtils } from "../scripts/ai-chat-turbo-engine/src/core/composer";

function makeVisible<T extends HTMLElement>(element: T): T {
  Object.defineProperty(element, "getClientRects", {
    configurable: true,
    value: () => [{ width: 20, height: 20 }],
  });
  return element;
}

function wrap(element: HTMLElement, levels: number): HTMLElement {
  let node = element;
  for (let index = 0; index < levels; index++) {
    const parent = document.createElement("div");
    parent.append(node);
    node = parent;
  }
  return node;
}

function createEditor(): HTMLDivElement {
  const editor = document.createElement("div");
  editor.className = "ql-editor";
  editor.setAttribute("contenteditable", "true");
  editor.textContent = "hello";
  return editor;
}

function createSendControl(): HTMLDivElement {
  const control = document.createElement("div");
  control.id = "yuanbao-send-btn";
  control.setAttribute("aria-label", "发送");
  return makeVisible(control);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("send control lookup", () => {
  it("uses a declared control that sits outside the composer container", () => {
    const editor = createEditor();
    const root = wrap(editor, 6);
    const control = createSendControl();
    root.append(control);
    document.body.append(root);

    const composer = createComposerUtils({ currentPlatform: PLATFORMS.yuanbao });

    expect(composer.findSendControl(editor)).toBe(control);
  });

  it("still prefers a declared control inside the same composer", () => {
    // The far composer comes first in document order, so a naive first match
    // would press the wrong control.
    const farEditor = createEditor();
    const farRoot = wrap(farEditor, 6);
    const far = createSendControl();
    farRoot.append(far);
    document.body.append(farRoot);

    const editor = createEditor();
    const root = wrap(editor, 2);
    const sibling = createSendControl();
    root.append(sibling);
    document.body.append(root);

    const composer = createComposerUtils({ currentPlatform: PLATFORMS.yuanbao });

    expect(composer.findSendControl(editor)).toBe(sibling);
  });

  it("picks the control of the panel that owns the editor", () => {
    // Both panels declare the same id and sit at the same relative depth, so
    // document order alone would hand the editor the other panel's control.
    const farEditor = createEditor();
    const farRoot = wrap(farEditor, 6);
    const far = createSendControl();
    farRoot.append(far);
    document.body.append(farRoot);

    const editor = createEditor();
    const root = wrap(editor, 6);
    const own = makeVisible(createSendControl());
    root.append(own);
    document.body.append(root);

    const composer = createComposerUtils({ currentPlatform: PLATFORMS.yuanbao });

    expect(composer.findSendControl(editor)).toBe(own);
  });

  it("does not borrow a declared control from an unrelated subtree", () => {
    // A submit button in a login dialog must never become the composer's send
    // control just because it is the first declared match in the document.
    const editor = createEditor();
    document.body.append(wrap(editor, 6));

    const dialog = document.createElement("div");
    dialog.append(createSendControl());
    document.body.append(dialog);

    const composer = createComposerUtils({ currentPlatform: PLATFORMS.yuanbao });

    expect(composer.findSendControl(editor)).toBe(null);
  });
});

describe("keyboard submit fallback", () => {
  function collectEnterPresses(input: HTMLElement): KeyboardEvent[] {
    const seen: KeyboardEvent[] = [];
    input.addEventListener("keydown", (event) => {
      seen.push(event as KeyboardEvent);
    });
    return seen;
  }

  it("does not replay a plain Enter where Enter already means send", () => {
    const editor = createEditor();
    document.body.append(editor);
    const seen = collectEnterPresses(editor);

    const composer = createComposerUtils({ currentPlatform: PLATFORMS.yuanbao });

    expect(composer.fallbackKeyboardSubmit(editor)).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it("keeps the legacy Enter replay on platforms without the opt-in", () => {
    const editor = createEditor();
    document.body.append(editor);
    const seen = collectEnterPresses(editor);

    const composer = createComposerUtils({
      currentPlatform: PLATFORMS.chatgpt,
    });

    expect(composer.fallbackKeyboardSubmit(editor)).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0].key).toBe("Enter");
  });
});
