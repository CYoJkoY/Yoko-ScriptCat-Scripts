import { MAX_SVG_CHARS, SVG_NS } from "../config";

export interface SvgSanitizeResult {
  node: SVGElement | null;
  error: string;
}

// Custom SVGs may only contain static drawing tags and attributes; scripts,
// event handlers, external references and foreignObject are dropped. Every id
// is prefixed so custom art cannot collide with the host page or built-ins.
const SVG_ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
]);

const SVG_ALLOWED_ATTRS = new Set([
  "viewBox",
  "preserveAspectRatio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "transform",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "clipPathUnits",
  "clip-path",
  "clip-rule",
  "mask",
  "id",
  "vector-effect",
]);

let svgIdSeq = 0;

export function nextSvgId(prefix = "gc-orn"): string {
  svgIdSeq += 1;
  return `${prefix}-${svgIdSeq.toString(36)}`;
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

export function sanitizeSvg(source: unknown): SvgSanitizeResult {
  if (typeof source !== "string" || !source.trim()) {
    return { node: null, error: "SVG 内容为空" };
  }
  if (source.length > MAX_SVG_CHARS) {
    return { node: null, error: `SVG 超过 ${MAX_SVG_CHARS / 1024}KB 上限` };
  }
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  } catch {
    return { node: null, error: "SVG 无法解析" };
  }
  const sourceRoot = parsed.documentElement;
  if (
    !sourceRoot ||
    sourceRoot.localName !== "svg" ||
    parsed.querySelector("parsererror")
  ) {
    return { node: null, error: "请输入完整的 SVG 根元素" };
  }

  const idMap = new Map<string, string>();
  svgIdSeq += 1;
  const prefix = `gc-user-svg-${svgIdSeq.toString(36)}-`;
  // The root element itself can also be referenced by <use>/url(#id), so it
  // must be visited together with descendants that carry ids.
  for (const node of [sourceRoot, ...sourceRoot.querySelectorAll("[id]")]) {
    const id = node.getAttribute("id");
    if (id !== null && /^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$/.test(id)) {
      idMap.set(id, `${prefix}${id}`);
    }
  }

  let nodeCount = 0;
  const copyNode = (sourceNode: Node, depth: number): SVGElement | null => {
    if (depth > 12 || nodeCount > 500) return null;
    if (!isElement(sourceNode)) return null;
    const tag = sourceNode.localName;
    if (!SVG_ALLOWED_TAGS.has(tag)) return null;
    nodeCount += 1;
    const target = document.createElementNS(SVG_NS, tag);
    for (const attr of sourceNode.attributes) {
      const name = attr.name;
      if (!SVG_ALLOWED_ATTRS.has(name)) continue;
      let value = attr.value;
      if (value.length > 2048) continue;
      if (name === "id") {
        value = idMap.get(value) || `${prefix}${nodeCount}`;
      } else {
        value = value.replace(
          /url\(\s*['"]?#([A-Za-z_][A-Za-z0-9_.:-]*)['"]?\s*\)/g,
          (match: string, id: string): string => {
            const mapped = idMap.get(id);
            return mapped === undefined ? "none" : `url(#${mapped})`;
          },
        );
      }
      // Only internal url(#id) references that were rewritten above may stay;
      // anything still carrying url(...) points at an external resource.
      const withoutInternalRefs = value.replace(
        /url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_.:-]*['"]?\s*\)/gi,
        "",
      );
      if (/url\s*\(/i.test(withoutInternalRefs)) continue;
      if (/javascript:|data:text\/html/i.test(value)) continue;
      target.setAttribute(name, value);
    }
    for (const child of sourceNode.childNodes) {
      const copied = copyNode(child, depth + 1);
      if (copied) target.appendChild(copied);
    }
    return target;
  };

  const root = copyNode(sourceRoot, 0);
  if (!root) {
    return { node: null, error: "SVG 中没有可显示的图形" };
  }
  const hasGraphic = [...root.querySelectorAll(
    "path,circle,ellipse,rect,line,polyline,polygon",
  )].some((node) => !node.closest("defs,clipPath,mask"));
  if (!hasGraphic) {
    return { node: null, error: "SVG 中没有可显示的图形" };
  }
  if (!root.getAttribute("viewBox")) {
    const width = Number.parseFloat(sourceRoot.getAttribute("width") ?? "");
    const height = Number.parseFloat(sourceRoot.getAttribute("height") ?? "");
    root.setAttribute(
      "viewBox",
      Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
        ? `0 0 ${width} ${height}`
        : "0 0 16 16",
    );
  }
  root.setAttribute("aria-hidden", "true");
  root.setAttribute("focusable", "false");
  return { node: root, error: "" };
}
