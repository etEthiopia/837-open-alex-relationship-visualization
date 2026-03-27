#!/usr/bin/env python3
"""
STRICT uniqueness resolution for university visual encodings.
Each institution gets a UNIQUE (color + texture) combination.
"""

import re
from collections import defaultdict

# Available textures (4-5 as requested)
TEXTURES = ['solid', 'horizontal', 'vertical', 'diagonal', 'dots']

def extract_current_encodings():
    """Extract current encodings."""
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
                    if name in encodings and texture in TEXTURES:
                        encodings[name]['texture'] = texture

    return encodings

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hsl(r, g, b):
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
    r1, g1, b1 = hex_to_rgb(color1)
    r2, g2, b2 = hex_to_rgb(color2)

    h1, s1, l1 = rgb_to_hsl(r1, g1, b1)
    h2, s2, l2 = rgb_to_hsl(r2, g2, b2)

    hue_diff = min(abs(h1 - h2), 360 - abs(h1 - h2)) / 180
    sat_diff = abs(s1 - s2)
    light_diff = abs(l1 - l2)

    distance = (hue_diff**2 * 0.5 + light_diff**2 * 0.3 + sat_diff**2 * 0.2)**0.5
    return distance

def find_all_conflicts(encodings):
    """Find all institutions that need resolution."""
    conflicts = []

    # Group by color
    color_groups = defaultdict(list)
    for name, enc in encodings.items():
        color_groups[enc['color']].append(name)

    # Find colors used by multiple institutions
    for color, institutions in color_groups.items():
        if len(institutions) > 1:
            conflicts.extend(institutions[1:])  # All except first get textures

    # Find perceptually similar pairs (even with different colors)
    names = list(encodings.keys())
    perceptual_conflicts = set()

    for i, name1 in enumerate(names):
        for name2 in names[i+1:]:
            if perceptual_distance(encodings[name1]['color'], encodings[name2]['color']) < 0.12:
                perceptual_conflicts.add(name1)
                perceptual_conflicts.add(name2)

    conflicts.extend(list(perceptual_conflicts))
    return list(set(conflicts))  # Remove duplicates

def create_strict_resolution():
    """Create STRICT uniqueness resolution."""
    encodings = extract_current_encodings()
    conflicts = find_all_conflicts(encodings)

    print("=" * 100)
    print("STRICT UNIQUENESS RESOLUTION - UNIVERSITY VISUAL ENCODINGS")
    print("=" * 100)
    print()

    print(f"Total institutions: {len(encodings)}")
    print(f"Institutions needing texture assignment: {len(conflicts)}")
    print()

    # Create resolution mapping
    resolution = {}

    # Assign textures to conflicting institutions
    texture_index = 0
    for institution in sorted(conflicts):
        if institution in encodings:
            # Cycle through textures (skip 'solid' for conflicts)
            texture = TEXTURES[(texture_index % (len(TEXTURES) - 1)) + 1]
            resolution[institution] = {
                'color': encodings[institution]['color'],
                'texture': texture,
                'reason': 'Collision resolution - assigned texture for uniqueness'
            }
            texture_index += 1

    # Keep non-conflicting institutions as solid
    for institution in encodings:
        if institution not in conflicts:
            resolution[institution] = {
                'color': encodings[institution]['color'],
                'texture': 'solid',
                'reason': 'No conflicts - kept solid'
            }

    print("CONFLICTING INSTITUTIONS REQUIRING TEXTURES:")
    print("-" * 100)
    for i, institution in enumerate(sorted(conflicts), 1):
        if institution in resolution:
            res = resolution[institution]
            print("2d")
    print()

    print("FINAL ENCODING TABLE:")
    print("-" * 100)
    print(f"{'Institution':<45} {'Color':<10} {'Texture':<12} {'Reason'}")
    print("-" * 100)

    for institution in sorted(resolution.keys()):
        res = resolution[institution]
        reason = res['reason'][:35] + "..." if len(res['reason']) > 35 else res['reason']
        print(f"{institution:<45} {res['color']:<10} {res['texture']:<12} {reason}")

    print()
    print("TEXTURE DISTRIBUTION:")
    print("-" * 100)
    texture_counts = defaultdict(int)
    for res in resolution.values():
        texture_counts[res['texture']] += 1

    for texture in TEXTURES:
        count = texture_counts[texture]
        print(f"  {texture:<12}: {count:2d} institutions")

    print()
    print("VALIDATION:")
    print("-" * 100)

    # Check uniqueness
    combos = set()
    duplicates = []
    for institution, res in resolution.items():
        combo = f"{res['color']}_{res['texture']}"
        if combo in combos:
            duplicates.append((institution, combo))
        combos.add(combo)

    if duplicates:
        print(f"ERROR: Found {len(duplicates)} duplicate combinations!")
        for inst, combo in duplicates:
            print(f"  {inst}: {combo}")
    else:
        print("SUCCESS: All 41 institutions have unique (color + texture) combinations")

    return resolution

if __name__ == '__main__':
    resolution = create_strict_resolution()
