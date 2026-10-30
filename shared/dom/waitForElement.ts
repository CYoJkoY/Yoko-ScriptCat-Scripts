export interface WaitForElementOptions<T extends Element> {
  readonly root?: ParentNode;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly isMatch?: (element: Element) => element is T;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/** Resolve with the first matching descendant, or null on timeout or cancellation. */
export function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  options: WaitForElementOptions<T> = {},
): Promise<T | null> {
  const root = options.root ?? document;
  const predicate = options.isMatch ?? ((element: Element): element is T => element instanceof HTMLElement);
  const find = (): T | null => {
    for (const element of root.querySelectorAll(selector)) {
      if (predicate(element)) return element;
    }
    return null;
  };
  const immediate = find();
  if (immediate !== null) return Promise.resolve(immediate);
  if (options.signal?.aborted === true) return Promise.resolve(null);
  return new Promise<T | null>((resolve) => {
    let timer: TimerHandle | null = null;
    const stop = (): void => {
      observer.disconnect();
      options.signal?.removeEventListener("abort", onAbort);
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const settle = (value: T | null): void => {
      stop();
      resolve(value);
    };
    const onAbort = (): void => settle(null);
    const observer = new MutationObserver(() => {
      const match = find();
      if (match !== null) settle(match);
    });
    observer.observe(root instanceof Document ? root.documentElement : root, {
      childList: true,
      subtree: true,
    });
    if (options.timeoutMs !== undefined && options.timeoutMs >= 0) {
      timer = setTimeout(() => settle(null), options.timeoutMs);
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });
  });
}
