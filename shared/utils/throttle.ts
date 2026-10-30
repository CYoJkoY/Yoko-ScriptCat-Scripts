export interface Throttled<Args extends readonly unknown[]> {
  (...args: Args): void;
  cancel(): void;
  flush(): void;
  readonly pending: boolean;
}

export interface ThrottleOptions {
  readonly intervalMs: number;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly cancelSchedule?: (handle: ReturnType<typeof setTimeout>) => void;
}

export function createThrottled<Args extends readonly unknown[]>(
  task: (...args: Args) => void,
  options: ThrottleOptions,
): Throttled<Args> {
  const now = options.now ?? (() => Date.now());
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? ((handle) => clearTimeout(handle));
  const intervalMs = Math.max(0, options.intervalMs);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = Number.NEGATIVE_INFINITY;
  let lastArgs: Args | null = null;

  const invoke = (): void => {
    timer = null;
    lastRun = now();
    const args = lastArgs;
    lastArgs = null;
    if (args !== null) task(...args);
  };

  const throttled = ((...args: Args): void => {
    lastArgs = args;
    if (timer !== null) return;
    const remaining = intervalMs - (now() - lastRun);
    if (remaining <= 0) {
      invoke();
      return;
    }
    timer = schedule(invoke, remaining);
    // The methods below complete the callable; the cast names that final shape.
  }) as Throttled<Args> & { cancel: () => void; flush: () => void; pending: boolean };

  throttled.cancel = (): void => {
    if (timer !== null) cancelSchedule(timer);
    timer = null;
    lastArgs = null;
  };
  throttled.flush = (): void => {
    if (timer === null) return;
    cancelSchedule(timer);
    invoke();
  };
  Object.defineProperty(throttled, "pending", { get: () => timer !== null });
  return throttled;
}
