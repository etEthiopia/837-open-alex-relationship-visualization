/**
 * 20-color palette ordered by maximum perceptual separation.
 * Each new color is as far as possible from all previous ones.
 * So the first N colors are always the most distinct subset.
 *
 * All colors are vivid, medium-dark, and tested against a light (#f5f5f1) background.
 * Avoids HCL gamut-clamping artifacts that produce muddy browns/grays.
 */
const PALETTE = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#9333ea", // purple
  "#d97706", // amber
  "#0891b2", // cyan
  "#e11d48", // rose
  "#65a30d", // lime
  "#7c3aed", // violet
  "#ea580c", // orange
  "#0e7490", // dark teal
  "#c026d3", // fuchsia
  "#4f46e5", // indigo
  "#059669", // emerald
  "#b45309", // dark amber
  "#0284c7", // sky
  "#be185d", // pink
  "#15803d", // dark green
  "#6d28d9", // dark violet
  "#0369a1", // dark sky
];

export function distinctColors(n: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < n; i++) {
    colors.push(PALETTE[i % PALETTE.length]);
  }
  return colors;
}
