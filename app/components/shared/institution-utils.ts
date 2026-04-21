import { visualPalette } from "../../lib/visualPalette";
import { Author, Institution } from "./types";

// ──────────────────────────────────────────────────────────────
// Institution Grouping & Mapping
// ──────────────────────────────────────────────────────────────

export function groupAuthorsByInstitution(
  authors: Author[]
): Map<string, Author[]> {
  const institutionGroups = new Map<string, Author[]>();
  authors.forEach((author) => {
    if (!institutionGroups.has(author.institution)) {
      institutionGroups.set(author.institution, []);
    }
    institutionGroups.get(author.institution)!.push(author);
  });
  return institutionGroups;
}

export function getInstitutionName(institution: Institution | null): string {
  if (!institution) return "Unknown";
  return institution.label_name || institution.display_name || institution.name;
}

export function createInstitutionMap(
  institutions: Institution[]
): Map<string, Institution> {
  const institutionMap = new Map<string, Institution>();
  institutions.forEach((inst) => {
    if (inst.label_name) institutionMap.set(inst.label_name, inst);
    institutionMap.set(inst.name, inst);
    institutionMap.set(inst.id, inst);
    if (inst.display_name) institutionMap.set(inst.display_name, inst);
  });
  return institutionMap;
}

// ──────────────────────────────────────────────────────────────
// University Color Mapping
// ──────────────────────────────────────────────────────────────

export function getUniversityColor(
  universityName: string,
  universityColorMap: Map<string, typeof visualPalette[0]>,
  fallbackIndex: number = 0
): typeof visualPalette[0] {
  return universityColorMap.get(universityName) || visualPalette[fallbackIndex];
}

export function createUniversityVisualMapping(
  universities: Array<{ name: string; fullName?: string; label_name?: string }>,
  universityColorMap: Map<string, typeof visualPalette[0]>
): Map<string, typeof visualPalette[0]> {
  return new Map(
    universities.map((uni) => {
      // Try multiple name variations
      const paletteItem =
        universityColorMap.get(uni.fullName || "") ||
        universityColorMap.get(uni.label_name || "") ||
        universityColorMap.get(uni.name);

      if (paletteItem) {
        return [uni.name, paletteItem];
      }
      return [uni.name, visualPalette[0]];
    })
  );
}
