import { SCRIPT_MARKER_ATTRIBUTE } from "./config";
import { installQqMailTheme } from "./install";

function bootstrap(): void {
  const root: Element | null = document.documentElement;
  if (root === null) return;
  if (root.hasAttribute(SCRIPT_MARKER_ATTRIBUTE)) return;
  root.setAttribute(SCRIPT_MARKER_ATTRIBUTE, "");
  installQqMailTheme();
}

const root: Element | null = document.documentElement;
if (root === null) {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
