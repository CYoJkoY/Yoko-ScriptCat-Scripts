const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  return element;
}

/**
 * A browser viewport outline with four inner corner marks. The outer frame
 * separates "网页" fullscreen from the usual corner-expand fullscreen icon.
 */
export function createWebFullscreenIcon(): SVGSVGElement {
  const icon = svgElement("svg", {
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false",
  });
  icon.style.width = "1em";
  icon.style.height = "1em";
  icon.style.flex = "0 0 auto";
  icon.style.pointerEvents = "none";

  const frame = svgElement("rect", {
    x: "2.75",
    y: "4.75",
    width: "18.5",
    height: "14.5",
    rx: "2.25",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
  });
  const corners = svgElement("path", {
    d: "M9 10V8.5h2M15 10V8.5h-2M9 14v1.5h2M15 14v1.5h-2",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.5",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });

  icon.append(frame, corners);
  return icon;
}
