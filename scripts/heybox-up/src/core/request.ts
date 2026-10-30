import { REQUEST_TIMEOUT_MS } from "../config";

/**
 * Request helpers shared by every API call: timeout aborts and cancellable
 * delays. Messages stay in the original Chinese because they surface in UI.
 */

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function waitForDelay(ms: number, signal?: AbortSignal | null): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason ?? new DOMException("请求已取消", "AbortError"));
      return;
    }
    const onAbort = (): void => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason ?? new DOMException("请求已取消", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternal = (): void => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted === true) controller.abort(externalSignal.reason);
  else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = window.setTimeout(() => {
    controller.abort(new DOMException("请求超时", "TimeoutError"));
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}
