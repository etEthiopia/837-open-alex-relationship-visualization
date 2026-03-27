#!/usr/bin/env python3
"""
Analyze university color conflicts to determine minimal texture usage.
Only apply texture to universities with perceptually similar colors.
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

def color_similarity(color1, color2, threshold=0.85):
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

def find_color_conflicts(universities, similarity_threshold=0.85):
    """Find groups of universities with perceptually similar colors."""
    conflicts = []

    # Check all pairs
    checked_pairs = set()
    for i, (name1, color1) in enumerate(universities.items()):
        for j, (name2, color2) in enumerate(universities.items()):
            if i >= j or (name1, name2) in checked_pairs:
                continue

            checked_pairs.add((name1, name2))
            checked_pairs.add((name2, name1))

            similarity = color_similarity(color1, color2, similarity_threshold)
            if similarity >= similarity_threshold:
                conflicts.append({
                    'universities': [name1, name2],
                    'colors': [color1, color2],
                    'similarity': similarity
                })

    return conflicts

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

    print("=== UNIVERSITY COLOR CONFLICT ANALYSIS ===")
    print(f"Total universities: {len(universities)}")
    print()

    # Find conflicts
    conflicts = find_color_conflicts(universities, 0.85)  # Lower threshold for more conflicts

    print(f"Color conflicts found: {len(conflicts)}")
    print()

    if conflicts:
        print("CONFLICTING UNIVERSITY GROUPS:")
        print("-" * 50)
        for i, conflict in enumerate(conflicts, 1):
            print(f"Conflict {i}:")
            for j, (uni, color) in enumerate(zip(conflict['universities'], conflict['colors'])):
                print(f"  {uni}: {color}")
            print(".3f")
            print()

    # Group universities by color families for analysis
    color_families = defaultdict(list)
    for name, color in universities.items():
        hsl = hex_to_hsl(color)
        hue = hsl[0]

        # Classify by hue ranges
        if 0 <= hue < 30 or 330 <= hue <= 360:  # Red
            family = "Red"
        elif 30 <= hue < 90:  # Yellow/Orange
            family = "Yellow/Orange"
            family = "Green"
        elif 150 <= hue < 210:  # Cyan
            family = "Cyan"
        elif 210 <= hue < 270:  # Blue
            family = "Blue"
        elif 270 <= hue < 330:  # Purple/Magenta
            family = "Purple"
        else:
            family = "Other"

        color_families[family].append((name, color))

    print("UNIVERSITIES BY COLOR FAMILY:")
    print("-" * 30)
    for family, unis in color_families.items():
        print(f"{family}: {len(unis)} universities")
        for name, color in sorted(unis):
            print(f"  {name}: {color}")
        print()

    # Calculate texture usage target (<20%)
    total_universities = len(universities)
    max_texture_usage = int(total_universities * 0.2)  # <20%
    print(f"TARGET: <20% texture usage = max {max_texture_usage} universities")
    print()

    # Identify minimal texture assignments
    texture_needed = set()
    for conflict in conflicts:
        # For each conflict group, assign texture to all but one
        unis = conflict['universities']
        for uni in unis[:-1]:  # All but the last one get texture
            texture_needed.add(uni)

    print(f"MINIMAL TEXTURE ASSIGNMENTS: {len(texture_needed)} universities need texture")
    if len(texture_needed) <= max_texture_usage:
        print("✅ Within target (<20%)")
    else:
        print("❌ Exceeds target - need to optimize further")

    print()
    print("Universities needing texture:")
    for uni in sorted(texture_needed):
        print(f"  {uni}")

if __name__ == "__main__":
    main()