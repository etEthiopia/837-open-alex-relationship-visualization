#!/usr/bin/env python3
"""
Comprehensive audit of institution visual encodings.
Identifies color collisions and proposes texture-based resolution.
"""

import re
from math import sqrt, atan2, degrees
from typing import Dict, List, Tuple, Set

# Extract all institutions and colors from the TypeScript file
INSTITUTION_COLORS = {
    'University of Toronto': '#002A5C',
    'University of British Columbia': '#002145',
    'McGill University': '#F44336',
    'McMaster University': '#7A003C',
    'Université de Montréal': '#E53935',
    'University of Alberta': '#007C41',
    'University of Calgary': '#D32F2F',
    'University of Ottawa': '#FF6B6B',
    'University of Waterloo': '#FFD54F',
    'Western University': '#492365',
    "Queen's University": '#8B1C3C',
    'University of Victoria': '#005493',
    'Dalhousie University': '#00693E',
    'Simon Fraser University': '#CC0633',
    'University of Saskatchewan': '#99CCFF',
    'University of Manitoba': '#D32F2F',
    'Carleton University': '#800000',
    'University of Guelph': '#7851A9',
    'York University': '#FFCC00',
    'Concordia University': '#8C1515',
    'University of Regina': '#4E2683',
    'Memorial University of Newfoundland': '#003366',
    'University of New Brunswick': '#C41C1C',
    'University of Windsor': '#4B9D3',
    'Brock University': '#7A003C',
    'Toronto Metropolitan University': '#B71C1C',
    'Ryerson University': '#B71C1C',
    'University of Lethbridge': '#8B5A3C',
    'Lakehead University': '#002A5C',
    'Laurentian University': '#A71930',
    'University of Northern British Columbia': '#002A5C',
    'Thompson Rivers University': '#B71C1C',
    'École de Technologie Supérieure': '#A71930',
    'University of Prince Edward Island': '#003366',
    'Mount Allison University': '#C41C1C',
    'St. Francis Xavier University': '#002145',
    'Acadia University': '#003366',
    'Mount Saint Vincent University': '#8B5A3C',
    "Saint Mary's University": '#003366',
    "University of King's College": '#002145',
    'Dalhousie University Agricultural Campus': '#00693E',
}

def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex to RGB."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hsl(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """Convert RGB to HSL (normalized 0-1)."""
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

def hsl_to_rgb(h: float, s: float, l: float) -> Tuple[int, int, int]:
    """Convert HSL back to RGB."""
    h = h / 360.0
    if s == 0:
        r = g = b = l
    else:
        def hue_to_rgb(p, q, t):
            if t < 0: t += 1
            if t > 1: t -= 1
            if t < 1/6: return p + (q - p) * 6 * t
            if t < 1/2: return q
            if t < 2/3: return p + (q - p) * (2/3 - t) * 6
            return p
        
        q = l * (1 + s) if l < 0.5 else l + s - l * s
        p = 2 * l - q
        r = hue_to_rgb(p, q, h + 1/3)
        g = hue_to_rgb(p, q, h)
        b = hue_to_rgb(p, q, h - 1/3)
    
    return int(round(r * 255)), int(round(g * 255)), int(round(b * 255))

def color_similarity(hex1: str, hex2: str) -> float:
    """Calculate perceptual similarity 0-1 (higher = more similar)."""
    r1, g1, b1 = hex_to_rgb(hex1)
    r2, g2, b2 = hex_to_rgb(hex2)
    
    h1, s1, l1 = rgb_to_hsl(r1, g1, b1)
    h2, s2, l2 = rgb_to_hsl(r2, g2, b2)
    
    # Hue difference (circular)
    hue_diff = min(abs(h1 - h2), 360 - abs(h1 - h2)) / 180
    sat_diff = abs(s1 - s2)
    light_diff = abs(l1 - l2)
    
    similarity = 1 - (hue_diff * 0.6 + sat_diff * 0.2 + light_diff * 0.2)
    return max(0, min(1, similarity))

def categorize_by_color_family(hex_color: str) -> str:
    """Categorize color into family."""
    h, s, l = rgb_to_hsl(*hex_to_rgb(hex_color))
    
    if s < 0.1:  # Grayscale
        return "Grayscale"
    elif 0 <= h < 30 or h >= 330:
        return "Red"
    elif 30 <= h < 60:
        return "Orange-Yellow"
    elif 60 <= h < 150:
        return "Green"
    elif 150 <= h < 200:
        return "Cyan"
    elif 200 <= h < 270:
        return "Blue"
    elif 270 <= h < 300:
        return "Purple"
    elif 300 <= h < 330:
        return "Pink-Magenta"
    else:
        return "Other"

def audit_collisions():
    """Perform comprehensive collision audit."""
    print("=" * 80)
    print("INSTITUTION VISUAL ENCODING AUDIT")
    print("=" * 80)
    print()
    
    # Convert to list with metadata
    institutions_data = []
    for name, hex_color in INSTITUTION_COLORS.items():
        r, g, b = hex_to_rgb(hex_color)
        h, s, l = rgb_to_hsl(r, g, b)
        family = categorize_by_color_family(hex_color)
        institutions_data.append({
            'name': name,
            'hex': hex_color,
            'rgb': (r, g, b),
            'h': h,
            's': s,
            'l': l,
            'family': family,
        })
    
    # Group by color family
    families = {}
    for inst in institutions_data:
        family = inst['family']
        if family not in families:
            families[family] = []
        families[family].append(inst)
    
    # Find exact color duplicates
    print("EXACT COLOR DUPLICATES:")
    print("-" * 80)
    color_to_institutions = {}
    for inst in institutions_data:
        hex_val = inst['hex']
        if hex_val not in color_to_institutions:
            color_to_institutions[hex_val] = []
        color_to_institutions[hex_val].append(inst['name'])
    
    exact_duplicates = {h: names for h, names in color_to_institutions.items() if len(names) > 1}
    if exact_duplicates:
        for hex_val, names in sorted(exact_duplicates.items()):
            print(f"  {hex_val}: {names}")
    else:
        print("  None found")
    print()
    
    # Find perceptually similar colors by family
    print("PERCEPTUALLY SIMILAR COLORS BY FAMILY:")
    print("-" * 80)
    
    collision_pairs = []
    for family, institutions in sorted(families.items()):
        if len(institutions) < 2:
            continue
        
        similar_in_family = []
        for i, inst1 in enumerate(institutions):
            for inst2 in institutions[i+1:]:
                sim = color_similarity(inst1['hex'], inst2['hex'])
                if sim > 0.85:  # Perceptually problematic threshold
                    similar_in_family.append((inst1, inst2, sim))
                    collision_pairs.append((inst1, inst2, sim))
        
        if similar_in_family:
            print(f"\n  {family}:")
            for inst1, inst2, sim in sorted(similar_in_family, key=lambda x: -x[2]):
                h1, s1, l1 = inst1['h'], inst1['s'], inst1['l']
                h2, s2, l2 = inst2['h'], inst2['s'], inst2['l']
                print(f"    {inst1['name']:<45} vs {inst2['name']:<45}")
                print(f"      {inst1['hex']} (H:{h1:5.1f} S:{s1:.1%} L:{l1:.1%}) <-> {inst2['hex']} (H:{h2:5.1f} S:{s2:.1%} L:{l2:.1%})")
                print(f"      Similarity: {sim:.2%}")
    
    if not collision_pairs:
        print("\n  No critical similarities found (>0.85 threshold)")
    print()
    
    # Statistics
    print("COLOR USAGE STATISTICS:")
    print("-" * 80)
    print(f"  Total institutions: {len(institutions_data)}")
    print(f"  Unique colors: {len(color_to_institutions)}")
    print(f"  Exact duplicate colors: {len(exact_duplicates)}")
    print(f"  Institutions with duplicate colors: {sum(len(n)-1 for n in exact_duplicates.values())}")
    print(f"  Perceptually similar pairs (>0.85): {len(collision_pairs)}")
    print()
    
    # Family distribution
    print("COLOR FAMILY DISTRIBUTION:")
    print("-" * 80)
    for family in sorted(families.keys()):
        count = len(families[family])
        print(f"  {family:<20} {count:3d} institutions")
    print()
    
    return institutions_data, collision_pairs, color_to_institutions

if __name__ == '__main__':
    institutions_data, collision_pairs, color_to_institutions = audit_collisions()
