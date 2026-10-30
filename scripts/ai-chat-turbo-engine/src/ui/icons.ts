export function createUiIcon(name: "file" | "eye" | "close" | "bolt", size = 14): SVGSVGElement {
  const paths = {
    file: ["M6 3.5h7.7L18.5 8v12H6z", "M13.5 3.5V8h5"],
    eye: [
      "M2.8 12s3.3-5 9.2-5 9.2 5 9.2 5-3.3 5-9.2 5-9.2-5-9.2-5z",
      "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    ],
    close: ["M5 5l14 14", "M19 5L5 19"],
    bolt: ["M13.2 2.5L5 13h6.1l-.8 8.5L19 10.2h-6.2z"],
  };

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const pathData of paths[name] || []) {
    const path = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  }

  return svg;
}
