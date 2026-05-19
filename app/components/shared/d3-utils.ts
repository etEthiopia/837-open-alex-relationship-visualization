import * as d3 from "d3";
import { visualPalette, getTextureStrokeForVariable } from "../../lib/visualPalette";

// ──────────────────────────────────────────────────────────────
// Tooltip Utilities
// ──────────────────────────────────────────────────────────────

export function createTooltip(id?: string) {
  if (id) {
    d3.select(`#${id}`).remove();
  }

  return d3
    .select("body")
    .append("div")
    .attr("id", id)
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "8px")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("font-family", "Outfit, system-ui, sans-serif")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("z-index", "1000");
}

export function removeTooltip(id: string) {
  d3.select(`#${id}`).remove();
}

// ──────────────────────────────────────────────────────────────
// SVG Pattern Generation
// ──────────────────────────────────────────────────────────────

interface PatternConfig {
  patternUnits?: string;
  width: number;
  height: number;
}

const DEFAULT_PATTERN_CONFIG: PatternConfig = {
  patternUnits: "userSpaceOnUse",
  width: 8,
  height: 8,
};

export function createTexturePatterns(
  defs: d3.Selection<SVGDefsElement, unknown, null, undefined>,
  universityVisuals: Map<string, typeof visualPalette[0]>,
  config: PatternConfig = DEFAULT_PATTERN_CONFIG
) {
  universityVisuals.forEach((visual, universityName) => {
    if (visual.texture === "none") return;

    const patternId = `pattern-${universityName.replace(/[^a-zA-Z0-9]/g, "-")}`;
    const strokeColor = getTextureStrokeForVariable(visual);

    const pattern = defs
      .append("pattern")
      .attr("id", patternId)
      .attr("patternUnits", config.patternUnits || "userSpaceOnUse")
      .attr("width", config.width)
      .attr("height", config.height);

    // Background color
    pattern
      .append("rect")
      .attr("width", config.width)
      .attr("height", config.height)
      .attr("fill", visual.color);

    // Add texture based on type
    addTextureLines(pattern, visual.texture, config, strokeColor);
  });
}

function addTextureLines(
  pattern: d3.Selection<SVGPatternElement, unknown, null, undefined>,
  textureType: string,
  config: PatternConfig,
  strokeColor: string
) {
  const { width, height } = config;
  const strokeWidth = 2;

  switch (textureType) {
    case "vertical":
      [2, 6].forEach((x) => {
        pattern
          .append("line")
          .attr("x1", x)
          .attr("y1", 0)
          .attr("x2", x)
          .attr("y2", height)
          .attr("stroke", strokeColor)
          .attr("stroke-width", strokeWidth);
      });
      break;

    case "horizontal":
      [2, 6].forEach((y) => {
        pattern
          .append("line")
          .attr("x1", 0)
          .attr("y1", y)
          .attr("x2", width)
          .attr("y2", y)
          .attr("stroke", strokeColor)
          .attr("stroke-width", strokeWidth);
      });
      break;

    case "diagonal":
      pattern
        .append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", width)
        .attr("y2", height)
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth);
      pattern
        .append("line")
        .attr("x1", -2)
        .attr("y1", 6)
        .attr("x2", 2)
        .attr("y2", 10)
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth);
      pattern
        .append("line")
        .attr("x1", 6)
        .attr("y1", -2)
        .attr("x2", 10)
        .attr("y2", 2)
        .attr("stroke", strokeColor)
        .attr("stroke-width", strokeWidth);
      break;

    case "dots":
      [2, 6].forEach((x) => {
        [2, 6].forEach((y) => {
          pattern
            .append("circle")
            .attr("cx", x)
            .attr("cy", y)
            .attr("r", 1)
            .attr("fill", strokeColor);
        });
      });
      break;
  }
}

// ──────────────────────────────────────────────────────────────
// Visual Mapping Utilities
// ──────────────────────────────────────────────────────────────

export function getFillForUniversity(
  universityName: string,
  universityVisuals: Map<string, typeof visualPalette[0]>
): string {
  const visual = universityVisuals.get(universityName);
  if (!visual) return "#808080"; // Fallback gray

  if (visual.texture === "none") {
    return visual.color;
  } else {
    const patternId = `pattern-${universityName.replace(/[^a-zA-Z0-9]/g, "-")}`;
    return `url(#${patternId})`;
  }
}

export function createUniversityVisualMap(
  universityNames: string[],
  universityColorMap: Map<string, typeof visualPalette[0]>
): Map<string, typeof visualPalette[0]> {
  return new Map(
    universityNames.map((name) => {
      const paletteItem = universityColorMap.get(name);
      if (paletteItem) {
        return [name, paletteItem];
      }
      return [name, visualPalette[0]];
    })
  );
}

// ──────────────────────────────────────────────────────────────
// Pin System Utilities
// ──────────────────────────────────────────────────────────────

export function createPinSystem() {
  const pinnedSet = new Set<string>();

  function setPinVisual(
    nodeSelection: d3.Selection<SVGGElement, any, any, any>,
    id: string,
    pinned: boolean
  ) {
    nodeSelection
      .filter((d) => d.id === id)
      .select<SVGCircleElement>("circle.node-circle")
      .attr("stroke", pinned ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.9)")
      .attr("stroke-width", pinned ? 2.5 : 2);
    nodeSelection
      .filter((d) => d.id === id)
      .select<SVGCircleElement>("circle.pin-dot")
      .style("opacity", pinned ? 1 : 0);
  }

  function addPin(id: string) {
    pinnedSet.add(id);
  }

  function removePin(id: string) {
    pinnedSet.delete(id);
  }

  function isPinned(id: string) {
    return pinnedSet.has(id);
  }

  return {
    pinnedSet,
    setPinVisual,
    addPin,
    removePin,
    isPinned,
  };
}
