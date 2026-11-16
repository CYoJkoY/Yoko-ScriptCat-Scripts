import { SCRIPT_MARKER_ATTRIBUTE } from "./config";
import { installWebFullscreen } from "./install";

function bootstrap(): void {
  const root = document.documentElement;
  if (root === null || root.hasAttribute(SCRIPT_MARKER_ATTRIBUTE)) return;
  root.setAttribute(SCRIPT_MARKER_ATTRIBUTE, "");
  installWebFullscreen(document);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
