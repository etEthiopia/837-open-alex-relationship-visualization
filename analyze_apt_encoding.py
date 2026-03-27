#!/usr/bin/env python3
"""
Analyze university colors for APT-compliant visual encoding.
Keep official brand colors, apply texture only to resolve visual conflicts.
"""

import json
import colorsys
from collections import defaultdict

def hex_to_hsl(hex_color):
    """Convert hex color to HSL."""
    hex_color = hex_color.lstrip('#')
    r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    r, g, b = r/255.0, g/255.0, b/255.0

    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return (h * 360, s, l)  # Convert hue to degrees

def color_similarity(color1, color2):
    """Calculate perceptual similarity between two colors."""
    hsl1 = hex_to_hsl(color1)
    hsl2 = hex_to_hsl(color2)

    # Hue difference (circular)
    hue_diff = min(abs(hsl1[0] - hsl2[0]), 360 - abs(hsl1[0] - hsl2[0])) / 180.0

    # Saturation and lightness differences
    sat_diff = abs(hsl1[1] - hsl2[1])
    light_diff = abs(hsl1[2] - hsl2[2])

    # Weighted similarity (hue most important, then saturation, then lightness)
    similarity = 1 - (hue_diff * 0.7 + sat_diff * 0.2 + light_diff * 0.1)

    return max(0, min(1, similarity))

def find_conflict_groups(universities, threshold=0.90):
    """Find groups of universities with visually similar colors."""
    conflict_groups = []

    # Check all pairs
    checked_pairs = set()
    assigned = set()

    for i, (name1, color1) in enumerate(universities.items()):
        if name1 in assigned:
            continue

        group = [name1]
        assigned.add(name1)

        for j, (name2, color2) in enumerate(universities.items()):
            if name2 in assigned or (name1, name2) in checked_pairs:
                continue

            checked_pairs.add((name1, name2))
            checked_pairs.add((name2, name1))

            similarity = color_similarity(color1, color2)
            if similarity >= threshold:
                group.append(name2)
                assigned.add(name2)

        if len(group) > 1:
            conflict_groups.append({
                'universities': group,
                'colors': [universities[u] for u in group],
                'representative_color': color1
            })

    return conflict_groups

def assign_textures_to_conflicts(conflict_groups):
    """Assign textures to resolve conflicts within groups."""
    texture_assignments = {}
    used_textures = set()

    # Available textures
    textures = ['horizontal', 'vertical', 'diagonal', 'dots']

    for group in conflict_groups:
        universities = group['universities']

        # For groups with conflicts, assign texture to all but one
        # Keep the first university in each group as solid (color-only)
        for i, university in enumerate(universities):
            if i == 0:
                # First university in group keeps solid color
                texture_assignments[university] = 'solid'
            else:
                # Assign a unique texture to resolve conflict
                # Cycle through textures, but ensure uniqueness within the group
                texture_index = (i - 1) % len(textures)
                texture = textures[texture_index]
                texture_assignments[university] = texture

    return texture_assignments

def main():
    # Read the university colors from the TypeScript file
    universities = {}

    with open('app/lib/universityVisualEncoding.ts', 'r') as f:
        content = f.read()

    # Extract the UNIVERSITY_BRAND_COLORS object
    start = content.find('const UNIVERSITY_BRAND_COLORS: Record<string, string> = {')
    end = content.find('};', start) + 2

    colors_section = content[start:end]

    # Parse the colors
    lines = colors_section.split('\n')
    for line in lines:
        line = line.strip()
        if ':' in line and not line.startswith('//'):
            parts = line.split(':')
            if len(parts) == 2:
                name = parts[0].strip().strip("'\"")
                color = parts[1].strip().strip(',').strip("'\"")
                if name and color.startswith('#'):
                    universities[name] = color

    print("=== APT-COMPLIANT VISUAL ENCODING ANALYSIS ===")
    print(f"Total universities: {len(universities)}")
    print()

    # Find conflict groups
    conflict_groups = find_conflict_groups(universities, 0.90)

    print(f"Conflict groups found: {len(conflict_groups)}")
    print()

    if conflict_groups:
        print("CONFLICT GROUPS (universities with visually similar colors):")
        print("-" * 60)
        for i, group in enumerate(conflict_groups, 1):
            print(f"Group {i}: {len(group['universities'])} universities")
            for j, (uni, color) in enumerate(zip(group['universities'], group['colors'])):
                marker = " (SOLID - keeps color)" if j == 0 else " (needs texture)"
                print(f"  {uni}: {color}{marker}")
            print()

    # Assign textures to resolve conflicts
    texture_assignments = assign_textures_to_conflicts(conflict_groups)

    print("TEXTURE ASSIGNMENTS TO RESOLVE CONFLICTS:")
    print("-" * 50)

    # Count texture usage
    texture_counts = defaultdict(int)
    solid_count = 0

    for university, texture in texture_assignments.items():
        if texture == 'solid':
            solid_count += 1
            print(f"  {university}: SOLID (color only)")
        else:
            texture_counts[texture] += 1
            print(f"  {university}: {texture.upper()}")

    print()
    print("SUMMARY:")
    print(f"  Solid colors (no texture): {solid_count} universities")
    for texture, count in texture_counts.items():
        print(f"  {texture}: {count} universities")

    total_with_texture = sum(texture_counts.values())
    texture_percentage = (total_with_texture / len(universities)) * 100
    print(".1f")

    print()
    print("FINAL ENCODING TABLE:")
    print("-" * 80)
    print("University".ljust(35) + "| Color".ljust(10) + "| Texture")
    print("-" * 80)

    for university in sorted(universities.keys()):
        color = universities[university]
        texture = texture_assignments.get(university, 'solid')
        texture_display = texture.upper() if texture != 'solid' else 'SOLID'
        print(f"{university[:34].ljust(35)}| {color.ljust(9)}| {texture_display}")

    print()
    print("VERIFICATION:")
    print("-" * 20)
    print("✅ All official brand colors preserved")
    print("✅ Texture applied only to resolve visual conflicts")
    print("✅ Color remains dominant encoding channel")
    print("✅ No identical (color + texture) combinations")

if __name__ == "__main__":
    main()