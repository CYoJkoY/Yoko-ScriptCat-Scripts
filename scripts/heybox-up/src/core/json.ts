/**
 * Narrowing helpers for values that arrive from the page, storage, or the
 * network. Every consumer keeps the original runtime behaviour by falling back
 * to the same empty value the released script used.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function readFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asElement(value: unknown): Element | null {
  return value instanceof Element ? value : null;
}

export function asHtmlElement(value: unknown): HTMLElement | null {
  return value instanceof HTMLElement ? value : null;
}

export function asInputElement(value: unknown): HTMLInputElement | null {
  return value instanceof HTMLInputElement ? value : null;
}

export function asButtonElement(value: unknown): HTMLButtonElement | null {
  return value instanceof HTMLButtonElement ? value : null;
}
