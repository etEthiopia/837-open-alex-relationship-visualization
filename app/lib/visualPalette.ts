/**
 * Visual Palette based on Opponent Color Theory + Mackinlay's Model
 *
 * Order of preference:
 * 1. First 12 colors (solid, no texture)
 * 2. Color + Texture combinations when we run out of solid colors
 *
 * Textures cycle through: vertical, horizontal, diagonal (45°), dots
 */

export type TextureType = "none" | "vertical" | "horizontal" | "diagonal" | "dots";

export interface VisualVariable {
  index: number;
  color: string;
  colorName: string;
  texture: TextureType;
  luminance: "dark" | "light";
  description: string;
}

// Base colors in order of preference
const baseColors: Array<{ hex: string; name: string; luminance: "dark" | "light" }> = [
  { hex: "#0957D0", name: "Blue", luminance: "dark" },
  { hex: "#eac54d", name: "Yellow", luminance: "light" },
  { hex: "#1e9114", name: "Green", luminance: "dark" },
  { hex: "#d12727", name: "Red", luminance: "dark" },
  { hex: "#b6a77f", name: "Beige", luminance: "light" },
  { hex: "#fc8888", name: "Pink", luminance: "light" },
  { hex: "#521e89", name: "Purple", luminance: "dark" },
  { hex: "#a3c683", name: "Lemon Green", luminance: "light" },
  { hex: "#c98226", name: "Orange", luminance: "light" },
  { hex: "#24807E", name: "Cyan", luminance: "dark" },
  { hex: "#5ec9ff", name: "Sky Blue", luminance: "light" },
  { hex: "#663c26", name: "Brown", luminance: "dark" }

];

const textures: TextureType[] = ["vertical", "horizontal", "diagonal", "dots"];

/**
 * Helper function to slightly modify a hex color
 * Changes the color by small amounts to create a similar but distinct variation
 */
function varyColor(hex: string, seed: number): string {
  // Remove # if present
  const cleanHex = hex.startsWith("#") ? hex.slice(1) : hex;

  // Parse RGB values
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Create deterministic but varied changes based on seed
  const variation = 15 + (seed % 20); // Variation between 15-34
  const rVariation = ((seed * 7) % 2 === 0 ? 1 : -1) * variation;
  const gVariation = ((seed * 11) % 2 === 0 ? 1 : -1) * variation;
  const bVariation = ((seed * 13) % 2 === 0 ? 1 : -1) * variation;

  // Apply variations and clamp to 0-255
  const newR = Math.max(0, Math.min(255, r + rVariation));
  const newG = Math.max(0, Math.min(255, g + gVariation));
  const newB = Math.max(0, Math.min(255, b + bVariation));

  // Convert back to hex
  return "#" + [newR, newG, newB]
    .map(v => v.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate the complete visual palette
 * Strategy:
 * - i < 12: Solid colors (cycle through all 12 colors)
 * - i < 60: Original colors with rotating textures (vertical, horizontal, diagonal, dots)
 * - i >= 60: Color variations with random textures
 */
function generatePalette(maxItems: number = 100): VisualVariable[] {
  const palette: VisualVariable[] = [];

  const colorsCount = baseColors.length;
  const texturesCount = textures.length;
  const colorsUsageMap = new Map<string, number>(); // Track how many times each base color has been used for variations
  let t = 0; // Global texture counter

  for (let i = 0; i < maxItems; i++) {
    const colorIndex = i % colorsCount;
    const baseColor = baseColors[colorIndex];

    if (i < 12) {
      // First 12 items: solid colors
      palette.push({
        index: i + 1,
        color: baseColor.hex,
        colorName: baseColor.name,
        texture: "none",
        luminance: baseColor.luminance,
        description: `${baseColor.name} (solid)`,
      });
    } else if (i < 60) {
      // Items 12-59: original colors with textures
      const colorUsedTexture = colorsUsageMap.get(baseColor.hex) ?? -1;
      const textureToUse = colorUsedTexture === -1 ? t:  (colorUsedTexture+1)%texturesCount

      palette.push({
        index: i + 1,
        color: baseColor.hex,
        colorName: baseColor.name,
        texture: textures[textureToUse],
        luminance: baseColor.luminance,
        description: `${baseColor.name} + ${textures[textureToUse]}`,
      });
      t = (t + 1) % texturesCount;
      colorsUsageMap.set(baseColor.hex, textureToUse);
    } else {
      // Items 60+: color variations with random textures
      const variationNumber = Math.floor((i - 60) / colorsCount) + 1;
      const variedColor = varyColor(baseColor.hex, variationNumber);
      const randomTextureIndex = (i + variationNumber) % texturesCount;

      palette.push({
        index: i + 1,
        color: variedColor,
        colorName: `${baseColor.name} variant ${variationNumber}`,
        texture: textures[randomTextureIndex],
        luminance: baseColor.luminance,
        description: `${baseColor.name} variant + ${textures[randomTextureIndex]}`,
      });
    }
  }

  return palette;
}

// Export the palette (100 total visual variables: 12 solid + 48 original textured + 40 color variations)
export const visualPalette = generatePalette(100);

// Helper function to get a visual variable by index (1-based)
export function getVisualVariable(index: number): VisualVariable | undefined {
  return visualPalette.find((v) => v.index === index);
}

// Helper function to get color and texture for a given index
export function getColorAndTexture(index: number): { color: string; texture: TextureType } {
  const variable = getVisualVariable(index);
  if (!variable) {
    // Default fallback
    return { color: "#808080", texture: "none" };
  }
  return { color: variable.color, texture: variable.texture };
}

/**
 * Get the stroke color for texture lines based on luminance
 * Dark colors get white texture lines, light colors get black texture lines
 */
export function getTextureStrokeColor(luminance: "dark" | "light"): string {
  return luminance === "dark" ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)";
}

/**
 * Get the texture stroke color for a visual variable
 */
export function getTextureStrokeForVariable(visual: VisualVariable): string {
  return getTextureStrokeColor(visual.luminance);
}
