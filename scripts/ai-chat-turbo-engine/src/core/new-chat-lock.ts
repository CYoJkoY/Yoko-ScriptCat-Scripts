import { reportRecoverableError } from "./diagnostics";
import { NEW_CHAT_SHORTCUT_CODE } from "./new-chat";

export type NewChatLockStatus =
  | "unsupported"
  | "inactive"
  | "activating"
  | "active"
  | "error";

export interface NewChatLockSnapshot {
  readonly status: NewChatLockStatus;
  readonly error: string | null;
}

export interface NewChatLockUtils {
  toggle(): Promise<void>;
  deactivate(): void;
  dispose(): void;
  isActive(): boolean;
  getSnapshot(): NewChatLockSnapshot;
  subscribe(listener: (snapshot: NewChatLockSnapshot) => void): () => void;
}

interface KeyboardLockApi {
  lock(keyCodes: string[]): Promise<void>;
  unlock(): void;
}

interface NewChatLockOptions {
  readonly doc?: Document;
  readonly keyboard?: KeyboardLockApi | null;
}

function isKeyboardLockApi(value: unknown): value is KeyboardLockApi {
  if (typeof value !== "object" || value === null) return false;
  if (!("lock" in value) || !("unlock" in value)) return false;
  return typeof value.lock === "function" && typeof value.unlock === "function";
}

function readKeyboardLockApi(view: Window | null): KeyboardLockApi | null {
  if (view === null) return null;
  const candidate: unknown = (
    view.navigator as Navigator & { readonly keyboard?: unknown }
  ).keyboard;
  return isKeyboardLockApi(candidate) ? candidate : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createNewChatLockUtils(
  options: NewChatLockOptions = {},
): NewChatLockUtils {
  const doc = options.doc ?? document;
  const keyboard =
    options.keyboard !== undefined
      ? options.keyboard
      : readKeyboardLockApi(doc.defaultView);
  const fullscreenRoot = doc.documentElement;
  const supported =
    keyboard !== null &&
    doc.fullscreenEnabled &&
    typeof fullscreenRoot.requestFullscreen === "function" &&
    typeof doc.exitFullscreen === "function";

  let snapshot: NewChatLockSnapshot = {
    status: supported ? "inactive" : "unsupported",
    error: null,
  };
  let ownsFullscreen = false;
  let lockHeld = false;
  let activationPending = false;
  let disposed = false;
  let activationId = 0;
  const listeners = new Set<(next: NewChatLockSnapshot) => void>();

  const emit = (next: NewChatLockSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
  };

  const unlockKeyboard = (): void => {
    if (keyboard === null) return;
    try {
      keyboard.unlock();
    } catch (error: unknown) {
      reportRecoverableError("release shortcut lock", error);
    }
  };

  const releaseLock = (): void => {
    if (!lockHeld) return;
    lockHeld = false;
    unlockKeyboard();
  };

  const exitOwnedFullscreen = (): void => {
    if (!ownsFullscreen) return;
    ownsFullscreen = false;
    if (doc.fullscreenElement === null) return;
    void doc.exitFullscreen().catch((error: unknown) => {
      reportRecoverableError("exit shortcut fullscreen", error);
    });
  };

  const deactivate = (): void => {
    const hadState =
      snapshot.status === "active" ||
      snapshot.status === "activating" ||
      snapshot.status === "error";
    if (!hadState && !ownsFullscreen) return;
    activationId++;
    releaseLock();
    exitOwnedFullscreen();
    emit({ status: supported ? "inactive" : "unsupported", error: null });
  };

  const onFullscreenChange = (): void => {
    if (doc.fullscreenElement !== null) return;
    if (snapshot.status === "active" || snapshot.status === "activating") {
      activationId++;
      ownsFullscreen = false;
      releaseLock();
      emit({ status: "inactive", error: null });
    }
  };

  const onPageHide = (): void => {
    activationId++;
    releaseLock();
    ownsFullscreen = false;
    if (snapshot.status === "active" || snapshot.status === "activating") {
      emit({ status: supported ? "inactive" : "unsupported", error: null });
    }
  };

  doc.addEventListener("fullscreenchange", onFullscreenChange);
  doc.defaultView?.addEventListener("pagehide", onPageHide);

  const toggle = async (): Promise<void> => {
    if (disposed || activationPending || snapshot.status === "activating") return;
    if (snapshot.status === "active") {
      deactivate();
      return;
    }
    if (!supported || keyboard === null) {
      emit({ status: "unsupported", error: null });
      return;
    }

    const attemptId = ++activationId;
    const enteredFullscreen = doc.fullscreenElement === null;
    const cancelled = (): boolean => attemptId !== activationId || disposed;
    activationPending = true;
    emit({ status: "activating", error: null });
    let lockRequested = false;
    try {
      if (enteredFullscreen) await fullscreenRoot.requestFullscreen();
      ownsFullscreen = enteredFullscreen;
      if (cancelled()) {
        exitOwnedFullscreen();
        return;
      }
      lockRequested = true;
      await keyboard.lock([NEW_CHAT_SHORTCUT_CODE]);
      lockHeld = true;
      if (cancelled()) {
        releaseLock();
        exitOwnedFullscreen();
        return;
      }
      if (doc.fullscreenElement === null) {
        throw new Error("Fullscreen ended before the shortcut lock was active");
      }
      emit({ status: "active", error: null });
    } catch (error: unknown) {
      if (lockRequested) {
        lockHeld = false;
        unlockKeyboard();
      }
      if (cancelled()) return;
      exitOwnedFullscreen();
      emit({ status: "error", error: errorMessage(error) });
    } finally {
      activationPending = false;
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    deactivate();
    releaseLock();
    disposed = true;
    doc.removeEventListener("fullscreenchange", onFullscreenChange);
    doc.defaultView?.removeEventListener("pagehide", onPageHide);
    listeners.clear();
  };

  return {
    toggle,
    deactivate,
    dispose,
    isActive: () => snapshot.status === "active",
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
  };
}
