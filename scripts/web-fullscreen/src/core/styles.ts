import type { StyleDeclaration } from "../config";

interface SavedStyle {
  readonly property: string;
  readonly value: string;
  readonly priority: string;
}

export interface StyleSnapshot {
  readonly element: HTMLElement;
  readonly values: readonly SavedStyle[];
}

export function captureStyles(
  element: HTMLElement,
  properties: readonly string[],
): StyleSnapshot {
  return {
    element,
    values: properties.map((property) => ({
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    })),
  };
}

export function applyStyles(
  element: HTMLElement,
  declarations: readonly StyleDeclaration[],
): void {
  for (const [property, value] of declarations) {
    element.style.setProperty(property, value, "important");
  }
}

export function restoreStyles(snapshot: StyleSnapshot): void {
  for (const { property, value, priority } of snapshot.values) {
    if (value === "") {
      snapshot.element.style.removeProperty(property);
      continue;
    }
    snapshot.element.style.setProperty(property, value, priority);
  }
}
