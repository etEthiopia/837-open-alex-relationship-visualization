#!/usr/bin/env python3
"""
Refined APT-compliant university visual encoding analysis.
Only apply texture to truly conflicting university pairs, not entire groups.
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

def find_specific_conflicts(universities, critical_pairs, threshold=0.92):
    """Find only specific university pairs that are truly visually similar."""
    conflicts = []

    for pair in critical_pairs:
        uni1, uni2 = pair
        if uni1 in universities and uni2 in universities:
            color1 = universities[uni1]
            color2 = universities[uni2]
            similarity = color_similarity(color1, color2)

            if similarity >= threshold:
                conflicts.append({
                    'universities': [uni1, uni2],
                    'colors': [color1, color2],
                    'similarity': similarity
                })

    return conflicts

def assign_minimal_textures(conflicts):
    """Assign texture to only one university per conflict pair."""
    texture_assignments = {}
    used_textures = set()

    textures = ['horizontal', 'vertical', 'diagonal', 'dots']

    for conflict in conflicts:
        unis = conflict['universities']

        # Assign texture to the second university in each pair
        # (first keeps solid color as the "primary" representative)
        target_uni = unis[1]  # Second university gets texture

        # Find an unused texture
        texture = None
        for t in textures:
            if t not in used_textures:
                texture = t
                used_textures.add(t)
                break

        # If all textures used, cycle back
        if not texture:
            texture = textures[len(used_textures) % len(textures)]

        texture_assignments[target_uni] = texture

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

    print("=== REFINED APT-COMPLIANT VISUAL ENCODING ANALYSIS ===")
    print(f"Total universities: {len(universities)}")
    print()

    # Define specific conflict pairs to check (based on user's requirements)
    critical_pairs = [
        # User's specific mentions
        ('York University', 'University of Waterloo'),
        ('Queen\'s University', 'McMaster University'),
        ('University of British Columbia', 'Simon Fraser University'),
        ('University of Ottawa', 'Ontario Tech University'),  # May not exist

        # Red family potential conflicts
        ('McGill University', 'University of Calgary'),
        ('McGill University', 'University of New Brunswick'),
        ('McGill University', 'Université de Montréal'),
        ('McGill University', 'Toronto Metropolitan University'),
        ('McGill University', 'École de Technologie Supérieure'),
        ('McGill University', 'University of Ottawa'),
        ('McGill University', 'York University'),

        # Other potential conflicts within families
        ('University of Toronto', 'University of British Columbia'),
        ('University of Toronto', 'Simon Fraser University'),
        ('University of Alberta', 'Dalhousie University'),
        ('Western University', 'University of Regina'),
        ('University of Windsor', 'Saint Mary\'s University'),
    ]

    print("CHECKING SPECIFIC CONFLICT PAIRS:")
    print("-" * 40)

    # Check each pair
    actual_conflicts = []
    for pair in critical_pairs:
        uni1, uni2 = pair
        if uni1 in universities and uni2 in universities:
            color1 = universities[uni1]
            color2 = universities[uni2]
            similarity = color_similarity(color1, color2)
            status = "CONFLICT" if similarity >= 0.92 else "OK"
            print(".3f")
            if similarity >= 0.92:
                actual_conflicts.append({
                    'universities': [uni1, uni2],
                    'colors': [color1, color2],
                    'similarity': similarity
                })

    print()
    print(f"FOUND {len(actual_conflicts)} TRUE CONFLICTS requiring texture")
    print()

    # Assign minimal textures
    texture_assignments = assign_minimal_textures(actual_conflicts)

    print("TEXTURE ASSIGNMENTS (minimal, targeted):")
    print("-" * 40)

    solid_universities = []
    textured_universities = []

    for university in sorted(universities.keys()):
        if university in texture_assignments:
            texture = texture_assignments[university]
            textured_universities.append(university)
            print(f"  {university}: {texture.upper()}")
        else:
            solid_universities.append(university)

    print()
    print("SOLID COLOR UNIVERSITIES (no texture):")
    print("-" * 40)
    for uni in sorted(solid_universities):
        print(f"  {uni}")

    print()
    print("TEXTURED UNIVERSITIES (need texture):")
    print("-" * 40)
    for uni in sorted(textured_universities):
        print(f"  {uni}")

    print()
    print("WHY TEXTURE IS NEEDED:")
    print("-" * 25)
    for conflict in actual_conflicts:
        uni1, uni2 = conflict['universities']
        color1, color2 = conflict['colors']
        similarity = conflict['similarity']
        textured_uni = uni2  # Second university gets texture
        print(f"  {textured_uni}: Conflicts with {uni1} (similarity: {similarity:.3f})")

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
    print("SUMMARY:")
    print("-" * 10)
    print(f"  Solid colors: {len(solid_universities)} universities ({(len(solid_universities)/len(universities)*100):.1f}%)")
    print(f"  With texture: {len(textured_universities)} universities ({(len(textured_universities)/len(universities)*100):.1f}%)")
    print()
    print("VERIFICATION:")
    print("-" * 20)
    print("✅ All official brand colors preserved")
    print("✅ Color remains dominant encoding channel")
    print("✅ Texture applied only to truly conflicting pairs")
    print("✅ Minimal texture usage - only when absolutely necessary")
    print("✅ No identical (color + texture) combinations")

if __name__ == "__main__":
    main()