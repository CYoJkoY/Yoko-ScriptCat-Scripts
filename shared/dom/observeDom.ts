export interface DomObservation {
  disconnect(): void;
  readonly active: boolean;
}

export interface ObserveDomOptions {
  readonly target?: Node;
  readonly config?: MutationObserverInit;
  readonly observe?: (target: Node, config: MutationObserverInit, callback: MutationCallback) => DomObservation;
}

const DEFAULT_CONFIG: MutationObserverInit = { childList: true, subtree: true };

/** Observe a DOM subtree and expose an idempotent disconnect handle. */
export function observeDom(
  selector: string,
  onMutations: MutationCallback,
  options: ObserveDomOptions = {},
): DomObservation | null {
  const target = options.target ?? document.querySelector(selector);
  if (target === null) return null;
  const config = options.config ?? DEFAULT_CONFIG;
  if (options.observe !== undefined) return options.observe(target, config, onMutations);
  const observer = new MutationObserver(onMutations);
  observer.observe(target, config);
  let active = true;
  return {
    disconnect: () => {
      if (!active) return;
      active = false;
      observer.disconnect();
    },
    get active() {
      return active;
    },
  };
}
