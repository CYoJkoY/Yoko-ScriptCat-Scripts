// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindReaderInteraction } from "../scripts/heybox-up/src/ui/reader-interactions";

const cleanups: (() => void)[] = [];
function mount(markup: string) {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  document.body.append(holder);
  const native = holder.firstElementChild!;
  const clone = native.cloneNode(true) as HTMLElement;
  document.body.append(clone);
  const binding = bindReaderInteraction(clone, native);
  cleanups.push(binding.dispose);
  return { holder, native, clone, binding };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.innerHTML = ""; });

describe("reader native component bridge", () => {
  it("maps duplicate nested option labels exactly and submits once", async () => {
    const { native, clone } = mount(`<div class="image-text__vote"><div class="vote-item"><span>Same</span></div><div class="vote-item"><span>Same</span></div><div class="vote-submit"><button>Submit</button></div></div>`);
    const choices = [vi.fn(), vi.fn()];
    native.querySelectorAll(".vote-item").forEach((option, index) => option.addEventListener("click", choices[index]!));
    const submit = vi.fn();
    native.querySelector(".vote-submit")!.addEventListener("click", submit);
    clone.querySelectorAll<HTMLElement>("span")[1]!.click();
    clone.querySelector<HTMLElement>("button")!.click();
    await settle();
    expect(choices[0]).not.toHaveBeenCalled();
    expect(choices[1]).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it.each(["radio", "checkbox"])("leaves %s choice rules to native handlers", async (type) => {
    const { native, clone } = mount(`<div class="image-text__vote"><input type="${type}" name="choice"><input type="${type}" name="choice"></div>`);
    const controls = native.querySelectorAll("input");
    const changes = vi.fn(() => { if (type === "checkbox") controls[1]!.checked = false; });
    native.addEventListener("change", changes);
    const proxies = clone.querySelectorAll("input");
    proxies[0]!.click();
    await settle();
    proxies[1]!.click();
    await settle();
    expect(changes).toHaveBeenCalledTimes(2);
    expect(proxies[0]!.checked).toBe(type === "checkbox");
    expect(proxies[1]!.checked).toBe(type === "radio");
  });

  it("forwards input and change once, and mirrors properties and equal-length results in place", async () => {
    const { native, clone, binding } = mount(`<div class="article-vote"><input value="old"><button>10%</button></div>`);
    const input = clone.querySelector("input")!;
    input.focus();
    const events = vi.fn();
    native.addEventListener("input", events);
    native.addEventListener("change", events);
    input.value = "new";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(events).toHaveBeenCalledTimes(2);
    expect(native.querySelector("input")!.value).toBe("new");
    const button = clone.querySelector("button");
    native.querySelector("button")!.firstChild!.nodeValue = "90%";
    native.querySelector("button")!.setAttribute("disabled", "");
    native.querySelector("input")!.value = "server";
    await settle();
    binding.refresh();
    expect(clone.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("server");
    expect(clone.querySelector("button")).toBe(button);
    expect(button!.textContent).toBe("90%");
    expect(button!.disabled).toBe(true);
  });

  it("rebinds a replaced component and releases forwarding and observation", async () => {
    const { holder, clone, binding } = mount(`<div class="image-text__vote"><button>Old</button></div>`);
    holder.innerHTML = `<div class="image-text__vote"><button>New</button></div>`;
    const native = holder.firstElementChild!;
    const clicked = vi.fn();
    native.querySelector("button")!.addEventListener("click", clicked);
    await settle();
    clone.querySelector("button")!.click();
    expect(clicked).toHaveBeenCalledTimes(1);
    binding.dispose();
    native.querySelector("button")!.textContent = "Gone";
    await settle();
    expect(clone.textContent).toBe("New");
    clone.querySelector("button")!.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("forwards multiselect choices and keyboard form submission to the native form", () => {
    const { native, clone } = mount(`<form><select multiple><option>A</option><option>B</option><option>C</option></select><button type="submit">Submit</button></form>`);
    const select = clone.querySelector("select")!;
    select.options[0]!.selected = true;
    select.options[2]!.selected = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(Array.from(native.querySelector("select")!.selectedOptions).map((option) => option.textContent)).toEqual(["A", "C"]);
    const submit = vi.fn((event: Event) => event.preventDefault());
    native.addEventListener("submit", submit);
    clone.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: clone.querySelector("button") }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
