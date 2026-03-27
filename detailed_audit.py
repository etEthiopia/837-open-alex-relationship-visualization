#!/usr/bin/env python3
"""
Detailed audit of current university visual encodings
"""

import json

# Get current encodings from the TypeScript file
def extract_current_encodings():
    """Extract current encodings from universityVisualEncoding.ts"""
    encodings = {}

    # Read the file
    with open('app/lib/universityVisualEncoding.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract UNIVERSITY_BRAND_COLORS
    import re
    colors_match = re.search(r'const UNIVERSITY_BRAND_COLORS: Record<string, string> = ({.*?});', content, re.DOTALL)
    if colors_match:
        colors_str = colors_match.group(1)
        # Simple parsing - this is approximate
        lines = colors_str.split('\n')
        for line in lines:
            line = line.strip()
            if line.startswith("'") and ':' in line:
                parts = line.split(':')
                if len(parts) >= 2:
                    name = parts[0].strip().strip("'\"")
                    color = parts[1].strip().strip(',').strip("'\"")
                    if name and color.startswith('#'):
                        encodings[name] = {'color': color, 'texture': 'solid'}

    # Extract TEXTURE_ASSIGNMENT_MAP
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
                    if name and texture in ['solid', 'horizontal', 'diagonal', 'vertical']:
                        if name in encodings:
                            encodings[name]['texture'] = texture

    return encodings

def audit_current_state():
    """Comprehensive audit of current encodings"""
    encodings = extract_current_encodings()

    print("=" * 100)
    print("CURRENT UNIVERSITY VISUAL ENCODING AUDIT")
    print("=" * 100)
    print()

    print(f"Total institutions found: {len(encodings)}")
    print()

    # Check for exact color duplicates
    print("EXACT COLOR DUPLICATES:")
    print("-" * 50)
    color_to_insts = {}
    for name, enc in encodings.items():
        color = enc['color']
        if color not in color_to_insts:
            color_to_insts[color] = []
        color_to_insts[color].append(name)

    duplicates = {c: names for c, names in color_to_insts.items() if len(names) > 1}
    if duplicates:
        for color, names in sorted(duplicates.items()):
            print(f"  {color}: {len(names)} institutions")
            for name in names:
                texture = encodings[name]['texture']
                print(f"    - {name} ({texture})")
    else:
        print("  ✓ None found")
    print()

    # Check for color+texture combinations
    print("COLOR + TEXTURE COMBINATIONS:")
    print("-" * 50)
    combo_to_insts = {}
    for name, enc in encodings.items():
        combo = f"{enc['color']}_{enc['texture']}"
        if combo not in combo_to_insts:
            combo_to_insts[combo] = []
        combo_to_insts[combo].append(name)

    duplicates = {c: names for c, names in combo_to_insts.items() if len(names) > 1}
    if duplicates:
        print("❌ CRITICAL: Found duplicate color+texture combinations!")
        for combo, names in sorted(duplicates.items()):
            color, texture = combo.split('_')
            print(f"  {color} + {texture}: {len(names)} institutions")
            for name in names:
                print(f"    - {name}")
    else:
        print("  ✓ All color+texture combinations are unique")
    print()

    # Show texture distribution
    print("TEXTURE DISTRIBUTION:")
    print("-" * 50)
    texture_counts = {}
    for enc in encodings.values():
        texture = enc['texture']
        texture_counts[texture] = texture_counts.get(texture, 0) + 1

    for texture in ['solid', 'horizontal', 'diagonal', 'vertical']:
        count = texture_counts.get(texture, 0)
        print(f"  {texture:<12}: {count:2d} institutions")
    print()

    # Show all encodings
    print("COMPLETE ENCODING TABLE:")
    print("-" * 80)
    print(f"{'Institution':<45} {'Color':<10} {'Texture':<12}")
    print("-" * 80)
    for name in sorted(encodings.keys()):
        enc = encodings[name]
        print(f"{name:<45} {enc['color']:<10} {enc['texture']:<12}")

if __name__ == '__main__':
    audit_current_state()
