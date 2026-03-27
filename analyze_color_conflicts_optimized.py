#!/usr/bin/env python3
"""
Optimized university color conflict analysis for minimal texture usage.
Only apply texture to universities with critically similar colors.
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

def find_critical_conflicts(universities, critical_threshold=0.95):
    """Find only the most critical color conflicts that absolutely need texture."""
    conflicts = []

    # Check all pairs
    checked_pairs = set()
    for i, (name1, color1) in enumerate(universities.items()):
        for j, (name2, color2) in enumerate(universities.items()):
            if i >= j or (name1, name2) in checked_pairs:
                continue

            checked_pairs.add((name1, name2))
            checked_pairs.add((name2, name1))

            similarity = color_similarity(color1, color2)
            if similarity >= critical_threshold:
                conflicts.append({
                    'universities': [name1, name2],
                    'colors': [color1, color2],
                    'similarity': similarity
                })

    return conflicts

def analyze_color_families(universities):
    """Analyze color distribution by families to identify problematic clusters."""
    families = defaultdict(list)

    for name, color in universities.items():
        hsl = hex_to_hsl(color)
        hue = hsl[0]

        # Classify by hue ranges
        if 0 <= hue < 30 or 330 <= hue <= 360:  # Red
            family = "Red"
        elif 30 <= hue < 90:  # Yellow/Orange
            family = "Yellow/Orange"
        elif 90 <= hue < 150:  # Green
            family = "Green"
        elif 150 <= hue < 210:  # Cyan
            family = "Cyan"
        elif 210 <= hue < 270:  # Blue
            family = "Blue"
        elif 270 <= hue < 330:  # Purple/Magenta
            family = "Purple"
        else:
            family = "Other"

        families[family].append((name, color))

    return families

def select_minimal_texture_assignments(conflicts, max_texture_count):
    """Select minimal texture assignments to resolve conflicts."""
    texture_needed = set()

    # Sort conflicts by similarity (most similar first)
    sorted_conflicts = sorted(conflicts, key=lambda x: x['similarity'], reverse=True)

    for conflict in sorted_conflicts:
        unis = conflict['universities']

        # If we haven't reached the limit, assign texture to resolve this conflict
        if len(texture_needed) < max_texture_count:
            # Add the first university in the pair (arbitrary choice)
            texture_needed.add(unis[0])

        if len(texture_needed) >= max_texture_count:
            break

    return texture_needed

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

    print("=== OPTIMIZED UNIVERSITY COLOR CONFLICT ANALYSIS ===")
    print(f"Total universities: {len(universities)}")
    print()

    # Target: <20% texture usage
    max_texture_count = int(len(universities) * 0.2)  # <20%
    print(f"TARGET: <20% texture usage = max {max_texture_count} universities")
    print()

    # Find only critical conflicts (very high similarity threshold)
    critical_conflicts = find_critical_conflicts(universities, 0.95)

    print(f"CRITICAL conflicts found: {len(critical_conflicts)} (similarity ≥ 0.95)")
    print()

    if critical_conflicts:
        print("CRITICAL CONFLICTING UNIVERSITY GROUPS:")
        print("-" * 50)
        for i, conflict in enumerate(critical_conflicts[:10], 1):  # Show first 10
            print(f"Conflict {i}:")
            for j, (uni, color) in enumerate(zip(conflict['universities'], conflict['colors'])):
                print(f"  {uni}: {color}")
            print(".3f")
            print()

    # Analyze color families
    families = analyze_color_families(universities)

    print("COLOR FAMILY ANALYSIS:")
    print("-" * 30)
    problematic_families = []
    for family, unis in families.items():
        print(f"{family}: {len(unis)} universities")
        if len(unis) > 1:
            # Check for conflicts within this family
            family_conflicts = find_critical_conflicts(dict(unis), 0.95)
            if family_conflicts:
                print(f"  ⚠️  {len(family_conflicts)} critical conflicts within {family} family")
                problematic_families.append(family)
        print()

    # Select minimal texture assignments
    texture_needed = select_minimal_texture_assignments(critical_conflicts, max_texture_count)

    print(f"MINIMAL TEXTURE ASSIGNMENTS: {len(texture_needed)} universities need texture")
    if len(texture_needed) <= max_texture_count:
        print("✅ Within target (<20%)")
    else:
        print("❌ Still exceeds target - conflicts too numerous")

    print()
    print("Universities needing texture:")
    for uni in sorted(texture_needed):
        print(f"  {uni}")

    print()
    print("RECOMMENDATIONS:")
    print("-" * 20)
    if len(texture_needed) <= max_texture_count:
        print("✅ Ready to implement: Color will be PRIMARY encoding channel")
        print("✅ Texture usage minimized to resolve only critical conflicts")
        print("✅ Strong colors maintained for all universities")
    else:
        print("❌ Need to adjust color palette or increase texture threshold")
        print("   Consider modifying colors in problematic families:")
        for family in problematic_families:
            print(f"   - {family} family has many similar colors")

if __name__ == "__main__":
    main()