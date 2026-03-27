#!/usr/bin/env python3
"""
Institution visual encoding collision resolution strategy.
Proposes brand-faithful refinements with texture fallbacks.
"""

import json
from typing import Dict, List, Tuple

# Exact duplicate groups requiring resolution
EXACT_DUPLICATE_GROUPS = {
    '#002145': ['University of British Columbia', 'St. Francis Xavier University', "University of King's College"],
    '#002A5C': ['University of Toronto', 'Lakehead University', 'University of Northern British Columbia'],
    '#003366': ['Memorial University of Newfoundland', 'University of Prince Edward Island', 'Acadia University', "Saint Mary's University"],
    '#00693E': ['Dalhousie University', 'Dalhousie University Agricultural Campus'],
    '#7A003C': ['McMaster University', 'Brock University'],
    '#8B5A3C': ['University of Lethbridge', 'Mount Saint Vincent University'],
    '#A71930': ['Laurentian University', 'École de Technologie Supérieure'],
    '#B71C1C': ['Toronto Metropolitan University', 'Ryerson University', 'Thompson Rivers University'],
    '#C41C1C': ['University of New Brunswick', 'Mount Allison University'],
    '#D32F2F': ['University of Calgary', 'University of Manitoba'],
}

# Our refined encoding proposal
# Strategy: Keep primary brand color, use texture for collisions, adjust similar colors within family
PROPOSED_ENCODING = {
    # BLUE FAMILY - Heavy collisions, need significant refinement
    'University of Toronto': {'color': '#002A5C', 'texture': 'solid', 'reasoning': 'Primary brand, keep as-is'},
    'University of British Columbia': {'color': '#0055B8', 'texture': 'solid', 'reasoning': 'Adjust UBC to brighter blue, avoids dark blue cluster'},
    'Lakehead University': {'color': '#003D7A', 'texture': 'horizontal', 'reasoning': 'Slightly darker variant with texture'},
    'University of Northern British Columbia': {'color': '#004E99', 'texture': 'diagonal', 'reasoning': 'Mid-tone blue with texture'},
    'Memorial University of Newfoundland': {'color': '#003366', 'texture': 'solid', 'reasoning': 'Keep, primary brand'},
    'University of Prince Edward Island': {'color': '#0052CC', 'texture': 'horizontal', 'reasoning': 'Slightly brighter with texture'},
    'Acadia University': {'color': '#004080', 'texture': 'vertical', 'reasoning': 'Darker mid-blue with texture'},
    "Saint Mary's University": {'color': '#1F5F99', 'texture': 'diagonal', 'reasoning': 'Lighter blue with texture'},
    'University of Victoria': {'color': '#005493', 'texture': 'solid', 'reasoning': 'Keep, distinct from others'},
    'Simon Fraser University': {'color': '#0066CC', 'texture': 'horizontal', 'reasoning': 'Bright blue, distinct'},
    
    # GREEN FAMILY
    'University of Alberta': {'color': '#007C41', 'texture': 'solid', 'reasoning': 'Keep as-is, only green institution'},
    'Dalhousie University': {'color': '#00693E', 'texture': 'solid', 'reasoning': 'Keep as-is'},
    'Dalhousie University Agricultural Campus': {'color': '#008B45', 'texture': 'horizontal', 'reasoning': 'Slightly brighter with texture'},
    
    # RED FAMILY - 20 institutions, significant effort needed
    'McGill University': {'color': '#F44336', 'texture': 'solid', 'reasoning': 'Very bright, highest lightness, no collision'},
    'Université de Montréal': {'color': '#E53935', 'texture': 'solid', 'reasoning': 'Bright red, distinct'},
    'University of Calgary': {'color': '#D32F2F', 'texture': 'solid', 'reasoning': 'Keep, mid-tone pure red'},
    'University of Ottawa': {'color': '#FF6B6B', 'texture': 'solid', 'reasoning': 'Light salmon-red, high lightness'},
    "Queen's University": {'color': '#8B1C3C', 'texture': 'solid', 'reasoning': 'Dark burgundy (keep)'},
    'University of New Brunswick': {'color': '#B8003C', 'texture': 'solid', 'reasoning': 'Deep red adjusting to avoid #C41C1C collision'},
    'Toronto Metropolitan University': {'color': '#B71C1C', 'texture': 'solid', 'reasoning': 'Dark pure red, primary brand'},
    'Ryerson University': {'color': '#C41C1C', 'texture': 'horizontal', 'reasoning': 'Variant with texture - legacy name'},
    'Thompson Rivers University': {'color': '#A71930', 'texture': 'vertical', 'reasoning': 'Burgundy-magenta with texture - different from TRU brand'},
    'Laurentian University': {'color': '#991133', 'texture': 'solid', 'reasoning': 'Dark burgundy, distinct'},
    'École de Technologie Supérieure': {'color': '#C72C48', 'texture': 'horizontal', 'reasoning': 'Adjusted magenta-red with texture'},
    'Mount Allison University': {'color': '#E63946', 'texture': 'diagonal', 'reasoning': 'Bright red with texture, avoids duplicates'},
    'Carleton University': {'color': '#800000', 'texture': 'solid', 'reasoning': 'Keep maroon'},
    'Concordia University': {'color': '#8C1515', 'texture': 'solid', 'reasoning': 'Keep dark red'},
    'University of Guelph': {'color': '#7851A9', 'texture': 'solid', 'reasoning': 'Purple (out of red family)'},
    'University of Manitoba': {'color': '#D81E28', 'texture': 'horizontal', 'reasoning': 'Bright true red with texture (avoid #D32F2F collision)'},
    'Brock University': {'color': '#7A003C', 'texture': 'horizontal', 'reasoning': 'Burgundy with texture'},
    'McMaster University': {'color': '#740029', 'texture': 'solid', 'reasoning': 'Darker burgundy, distinct'},
    'University of Lethbridge': {'color': '#8B5A3C', 'texture': 'solid', 'reasoning': 'Brown-burgundy (leave)'},
    'Mount Saint Vincent University': {'color': '#993344', 'texture': 'diagonal', 'reasoning': 'Medium burgundy with texture'},
    
    # CYAN FAMILY
    'University of Saskatchewan': {'color': '#99CCFF', 'texture': 'solid', 'reasoning': 'Keep as-is, light cyan'},
    'University of Windsor': {'color': '#4B9CD3', 'texture': 'solid', 'reasoning': 'Keep as-is, distinct cyan'},
    
    # YELLOW/GOLD FAMILY
    'University of Waterloo': {'color': '#FFD54F', 'texture': 'solid', 'reasoning': 'Keep gold'},
    'York University': {'color': '#FFCC00', 'texture': 'solid', 'reasoning': 'Keep yellow'},
    
    # PURPLE FAMILY
    'Western University': {'color': '#492365', 'texture': 'solid', 'reasoning': 'Keep purple'},
    'University of Regina': {'color': '#4E2683', 'texture': 'solid', 'reasoning': 'Keep darker purple'},
}

def print_collision_report():
    """Print the audit findings and resolution strategy."""
    
    print("=" * 100)
    print("INSTITUTION VISUAL ENCODING - COLLISION RESOLUTION STRATEGY")
    print("=" * 100)
    print()
    
    print("CRITICAL FINDINGS:")
    print("-" * 100)
    print("  1. EXACT COLOR DUPLICATES (10 colors used multiple times)")
    for color, institutions in sorted(EXACT_DUPLICATE_GROUPS.items()):
        if len(institutions) > 1:
            print(f"     {color}: {len(institutions)} institutions - {', '.join(institutions[:2])}{'...' if len(institutions) > 2 else ''}")
    print()
    
    print("  2. COLOR FAMILY IMBALANCE")
    print("     - Blue family: 10 institutions sharing 2-3 colors (massive collision)")
    print("     - Red family: 20 institutions with overlapping reds/burgundies")
    print("     - These families need texture-based differentiation")
    print()
    
    print("  3. PERCEPTUALLY SIMILAR PAIRS")
    print("     - 209 pairs of institutions >0.85% similar in HSL space")
    print("     - Primary issue: similar hue + saturation + lightness combinations")
    print()
    
    print("=" * 100)
    print("RESOLUTION STRATEGY")
    print("=" * 100)
    print()
    
    print("APPROACH:")
    print("  1. DISTINGUISH EXACT DUPLICATES: Give secondary institutions a texture overlay")
    print("  2. REFINE WITHIN FAMILIES: Use lightness/saturation variation for same-hue institutions")
    print("  3. TEXTURE CASCADE: horizontal, vertical, diagonal applied deterministically")
    print("  4. BRAND PRESERVATION: Keep primary brand color unchanged, adjust secondary")
    print()
    
    print("=" * 100)
    print("PROPOSED FINAL ENCODING TABLE")
    print("=" * 100)
    print()
    
    print(f"{'Institution':<45} {'Color':<10} {'Texture':<12} {'Reasoning':<40}")
    print("-" * 110)
    
    for inst in sorted(PROPOSED_ENCODING.keys()):
        enc = PROPOSED_ENCODING[inst]
        print(f"{inst:<45} {enc['color']:<10} {enc['texture']:<12} {enc['reasoning']:<40}")
    
    print()
    print("=" * 100)
    print("COLLISION RESOLUTION BY FAMILY")
    print("=" * 100)
    print()
    
    # Group results by color family for analysis
    families = {
        'Blue': ['University of Toronto', 'University of British Columbia', 'Lakehead University', 
                 'University of Northern British Columbia', 'Memorial University of Newfoundland',
                 'University of Prince Edward Island', 'Acadia University', "Saint Mary's University",
                 'University of Victoria', 'Simon Fraser University'],
        'Red': ['McGill University', 'Université de Montréal', 'University of Calgary', 'University of Ottawa',
                "Queen's University", 'University of New Brunswick', 'Toronto Metropolitan University',
                'Ryerson University', 'Thompson Rivers University', 'Laurentian University',
                'École de Technologie Supérieure', 'Mount Allison University', 'Carleton University',
                'Concordia University', 'University of Manitoba', 'Brock University',
                'McMaster University', 'Mount Saint Vincent University'],
        'Green': ['University of Alberta', 'Dalhousie University', 'Dalhousie University Agricultural Campus'],
        'Purple': ['Western University', 'University of Guelph', 'University of Regina'],
        'Other': ['University of Waterloo', 'York University', 'University of Saskatchewan', 'University of Windsor'],
    }
    
    for family, institutions in families.items():
        if not institutions:
            continue
        print(f"{family.upper()} FAMILY:")
        print("-" * 110)
        for inst in institutions:
            if inst in PROPOSED_ENCODING:
                enc = PROPOSED_ENCODING[inst]
                status = "COLLISION" if enc['texture'] != 'solid' else "OK"
                print(f"  {inst:<43} {enc['color']:<10} {enc['texture']:<12} [{status}]")
        print()
    
    print("=" * 100)
    print("SUMMARY OF CHANGES")
    print("=" * 100)
    print()
    
    # Count changes
    original = {
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
    
    color_changes = []
    texture_additions = []
    
    for inst, enc in PROPOSED_ENCODING.items():
        orig_color = original.get(inst, '#NONE')
        if orig_color != enc['color']:
            color_changes.append((inst, orig_color, enc['color']))
        if enc['texture'] != 'solid':
            texture_additions.append((inst, enc['texture']))
    
    print(f"Color changes: {len(color_changes)} institutions")
    print(f"Texture additions: {len(texture_additions)} institutions")
    print()
    
    print("COLOR CHANGES:")
    for inst, old, new in sorted(color_changes):
        print(f"  {inst:<43} {old} -> {new}")
    print()
    
    print("TEXTURE ASSIGNMENTS:")
    for inst, texture in sorted(texture_additions):
        print(f"  {inst:<43} {texture} pattern")
    print()

if __name__ == '__main__':
    print_collision_report()
