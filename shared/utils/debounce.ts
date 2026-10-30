export interface Debounced<Args extends readonly unknown[]> {
  (...args: Args): void;
  cancel(): void;
  flush(): void;
  readonly pending: boolean;
}

export interface DebounceOptions {
  readonly delayMs: number;
  readonly schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly cancelSchedule?: (handle: ReturnType<typeof setTimeout>) => void;
}

export function createDebounced<Args extends readonly unknown[]>(
  task: (...args: Args) => void,
  options: DebounceOptions,
): Debounced<Args> {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;

  const invoke = (): void => {
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    if (args !== null) task(...args);
  };

  const debounced = ((...args: Args): void => {
    lastArgs = args;
    if (timer !== null) cancelSchedule(timer);
    timer = schedule(invoke, Math.max(0, options.delayMs));
    // The methods below complete the callable; the cast names that final shape.
  }) as Debounced<Args> & { cancel: () => void; flush: () => void; pending: boolean };

  debounced.cancel = (): void => {
    if (timer !== null) cancelSchedule(timer);
    timer = null;
    lastArgs = null;
  };
  debounced.flush = (): void => {
    if (timer === null) return;
    cancelSchedule(timer);
    invoke();
  };
  Object.defineProperty(debounced, "pending", { get: () => timer !== null });
  return debounced;
}
