#!/usr/bin/env python3
"""
Advanced perceptual similarity audit for university encodings
"""

import re
from math import sqrt

def hex_to_rgb(hex_color):
    """Convert hex to RGB."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hsl(r, g, b):
    """Convert RGB to HSL."""
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    l = (max_c + min_c) / 2.0

    if max_c == min_c:
        h = s = 0.0
    else:
        d = max_c - min_c
        s = d / (2.0 - max_c - min_c) if l > 0.5 else d / (max_c + min_c)

        if max_c == r:
            h = (g - b) / d + (6 if g < b else 0)
        elif max_c == g:
            h = (b - r) / d + 2
        else:
            h = (r - g) / d + 4
        h /= 6

    return h * 360, s, l

def perceptual_distance(color1, color2):
    """Calculate perceptual distance in HSL space."""
    r1, g1, b1 = hex_to_rgb(color1)
    r2, g2, b2 = hex_to_rgb(color2)

    h1, s1, l1 = rgb_to_hsl(r1, g1, b1)
    h2, s2, l2 = rgb_to_hsl(r2, g2, b2)

    # Hue difference (circular)
    hue_diff = min(abs(h1 - h2), 360 - abs(h1 - h2)) / 180  # 0-1

    # Saturation and lightness differences
    sat_diff = abs(s1 - s2)
    light_diff = abs(l1 - l2)

    # Weighted perceptual distance
    # Hue is most important, then lightness, then saturation
    distance = sqrt(hue_diff**2 * 0.5 + light_diff**2 * 0.3 + sat_diff**2 * 0.2)

    return distance

def extract_encodings():
    """Extract current encodings from TypeScript file."""
    encodings = {}

    with open('app/lib/universityVisualEncoding.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract colors
    colors_match = re.search(r'const UNIVERSITY_BRAND_COLORS: Record<string, string> = ({.*?});', content, re.DOTALL)
    if colors_match:
        colors_str = colors_match.group(1)
        lines = colors_str.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith("'") and ':' in line and '#' in line:
                parts = line.split(':')
                if len(parts) >= 2:
                    name = parts[0].strip().strip("'\"")
                    color_part = parts[1].strip().strip(',').strip()
                    if color_part.startswith("'#") or color_part.startswith('"#"'):
                        color = color_part.strip("'\"")
                        encodings[name] = {'color': color, 'texture': 'solid'}

    # Extract textures
    texture_match = re.search(r'const TEXTURE_ASSIGNMENT_MAP: Record<string, .*?> = ({.*?});', content, re.DOTALL)
    if texture_match:
        texture_str = texture_match.group(1)
        lines = texture_str.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith("'") and ':' in line:
                parts = line.split(':')
                if len(parts) >= 2:
                    name = parts[0].strip().strip("'\"")
                    texture = parts[1].strip().strip(',').strip("'\"")
                    if name in encodings and texture in ['solid', 'horizontal', 'diagonal', 'vertical']:
                        encodings[name]['texture'] = texture

    return encodings

def find_perceptual_collisions(encodings, threshold=0.15):
    """Find perceptually similar colors."""
    collisions = []

    names = list(encodings.keys())
    for i, name1 in enumerate(names):
        for name2 in names[i+1:]:
            color1 = encodings[name1]['color']
            color2 = encodings[name2]['color']

            distance = perceptual_distance(color1, color2)
            if distance < threshold:
                collisions.append({
                    'inst1': name1,
                    'inst2': name2,
                    'color1': color1,
                    'color2': color2,
                    'distance': distance,
                    'texture1': encodings[name1]['texture'],
                    'texture2': encodings[name2]['texture']
                })

    return sorted(collisions, key=lambda x: x['distance'])

def audit_perceptual_collisions():
    """Main audit function."""
    encodings = extract_encodings()

    print("=" * 120)
    print("PERCEPTUAL COLLISION AUDIT - UNIVERSITY VISUAL ENCODINGS")
    print("=" * 120)
    print()

    print(f"Total institutions: {len(encodings)}")
    print()

    # Find perceptual collisions
    collisions = find_perceptual_collisions(encodings, threshold=0.15)

    print("PERCEPTUAL COLLISIONS (distance < 0.15):")
    print("-" * 120)

    if collisions:
        print(f"CRITICAL: Found {len(collisions)} perceptually similar pairs!")
        print()

        for i, collision in enumerate(collisions[:20], 1):  # Show top 20
            print(f"{i:2d}. Distance: {collision['distance']:.3f}")
            print(f"    {collision['inst1']:<45} {collision['color1']} ({collision['texture1']})")
            print(f"    {collision['inst2']:<45} {collision['color2']} ({collision['texture2']})")
            print()

        if len(collisions) > 20:
            print(f"... and {len(collisions) - 20} more collisions")
            print()
    else:
        print("No critical perceptual collisions found")
        print()

    # Check for same-color different-texture pairs
    print("SAME COLOR, DIFFERENT TEXTURE PAIRS:")
    print("-" * 120)

    color_groups = {}
    for name, enc in encodings.items():
        color = enc['color']
        if color not in color_groups:
            color_groups[color] = []
        color_groups[color].append((name, enc['texture']))

    same_color_different_texture = []
    for color, institutions in color_groups.items():
        if len(institutions) > 1:
            textures = set(texture for _, texture in institutions)
            if len(textures) > 1:
                same_color_different_texture.append((color, institutions))

    if same_color_different_texture:
        print(f"Found {len(same_color_different_texture)} colors with multiple textures (GOOD):")
        for color, institutions in same_color_different_texture:
            print(f"  {color}:")
            for name, texture in institutions:
                print(f"    - {name:<43} ({texture})")
        print()
    else:
        print("  No colors have multiple textures")
        print()

    # Show most problematic color families
    print("COLOR FAMILY ANALYSIS:")
    print("-" * 120)

    # Group by hue ranges
    families = {
        'Red': [],
        'Orange': [],
        'Yellow': [],
        'Green': [],
        'Cyan': [],
        'Blue': [],
        'Purple': [],
        'Pink': []
    }

    for name, enc in encodings.items():
        r, g, b = hex_to_rgb(enc['color'])
        h, s, l = rgb_to_hsl(r, g, b)

        if 0 <= h < 30 or h >= 330:
            families['Red'].append((name, enc))
        elif 30 <= h < 60:
            families['Orange'].append((name, enc))
        elif 60 <= h < 90:
            families['Yellow'].append((name, enc))
        elif 90 <= h < 150:
            families['Green'].append((name, enc))
        elif 150 <= h < 210:
            families['Cyan'].append((name, enc))
        elif 210 <= h < 270:
            families['Blue'].append((name, enc))
        elif 270 <= h < 300:
            families['Purple'].append((name, enc))
        elif 300 <= h < 330:
            families['Pink'].append((name, enc))

    for family, institutions in families.items():
        if len(institutions) > 1:
            print(f"\n{family} Family ({len(institutions)} institutions):")
            for name, enc in sorted(institutions, key=lambda x: rgb_to_hsl(*hex_to_rgb(x[1]['color']))[0]):
                h, s, l = rgb_to_hsl(*hex_to_rgb(enc['color']))
                print(f"  {name:<43} {enc['color']} H:{h:5.1f}° S:{s:.1%} L:{l:.1%} ({enc['texture']})")

    print()
    print("=" * 120)
    print("RECOMMENDATIONS")
    print("=" * 120)

    if collisions:
        print("1. The following pairs are perceptually too similar:")
        for collision in collisions[:5]:
            print(f"   - {collision['inst1']} vs {collision['inst2']} (distance: {collision['distance']:.3f})")
        print()

        print("2. Solutions:")
        print("   - Adjust lightness/saturation for one institution in each pair")
        print("   - Or assign different textures if colors must stay the same")
        print("   - Target: distance > 0.15 for all pairs")
    else:
        print("All encodings appear perceptually distinct")

if __name__ == '__main__':
    audit_perceptual_collisions()
