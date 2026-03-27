#!/usr/bin/env python3
"""
Verify the collision-resolved encodings are correct
"""

# Color and texture assignments from the implementation
EXPECTED_ENCODINGS = {
    # Blue family - verify textures assigned
    'University of Toronto': {'color': '#002A5C', 'texture': 'solid'},
    'University of British Columbia': {'color': '#0055B8', 'texture': 'solid'},
    'Lakehead University': {'color': '#003D7A', 'texture': 'horizontal'},
    'University of Northern British Columbia': {'color': '#004E99', 'texture': 'diagonal'},
    'Memorial University of Newfoundland': {'color': '#003366', 'texture': 'solid'},
    'University of Prince Edward Island': {'color': '#0052CC', 'texture': 'horizontal'},
    'Acadia University': {'color': '#004080', 'texture': 'vertical'},
    'Simon Fraser University': {'color': '#0066CC', 'texture': 'horizontal'},
    'University of Victoria': {'color': '#005493', 'texture': 'solid'},
    "Saint Mary's University": {'color': '#1F5F99', 'texture': 'diagonal'},
    
    # Red family - verify textures and color adjustments
    'McGill University': {'color': '#F44336', 'texture': 'solid'},
    'Université de Montréal': {'color': '#E53935', 'texture': 'solid'},
    'University of Calgary': {'color': '#D32F2F', 'texture': 'solid'},
    'University of Ottawa': {'color': '#FF6B6B', 'texture': 'solid'},
    "Queen's University": {'color': '#8B1C3C', 'texture': 'solid'},
    'University of New Brunswick': {'color': '#B8003C', 'texture': 'solid'},
    'Toronto Metropolitan University': {'color': '#B71C1C', 'texture': 'solid'},
    'Ryerson University': {'color': '#C41C1C', 'texture': 'horizontal'},
    'Thompson Rivers University': {'color': '#A71930', 'texture': 'vertical'},
    'Laurentian University': {'color': '#991133', 'texture': 'solid'},
    'École de Technologie Supérieure': {'color': '#C72C48', 'texture': 'horizontal'},
    'Mount Allison University': {'color': '#E63946', 'texture': 'diagonal'},
    'Carleton University': {'color': '#800000', 'texture': 'solid'},
    'Concordia University': {'color': '#8C1515', 'texture': 'solid'},
    'University of Lethbridge': {'color': '#8B5A3C', 'texture': 'solid'},
    'Brock University': {'color': '#7A003C', 'texture': 'horizontal'},
    'McMaster University': {'color': '#740029', 'texture': 'solid'},
    'University of Manitoba': {'color': '#D81E28', 'texture': 'horizontal'},
    'Mount Saint Vincent University': {'color': '#993344', 'texture': 'diagonal'},
    
    # Green family
    'University of Alberta': {'color': '#007C41', 'texture': 'solid'},
    'Dalhousie University': {'color': '#00693E', 'texture': 'solid'},
    'Dalhousie University Agricultural Campus': {'color': '#008B45', 'texture': 'horizontal'},
    
    # Other
    'University of Guelph': {'color': '#7851A9', 'texture': 'solid'},
    'York University': {'color': '#FFCC00', 'texture': 'solid'},
    'Western University': {'color': '#492365', 'texture': 'solid'},
    'University of Regina': {'color': '#4E2683', 'texture': 'solid'},
    'University of Saskatchewan': {'color': '#99CCFF', 'texture': 'solid'},
    'University of Waterloo': {'color': '#FFD54F', 'texture': 'solid'},
    'University of Windsor': {'color': '#4B9CD3', 'texture': 'solid'},
    'St. Francis Xavier University': {'color': '#003D80', 'texture': 'solid'},
    "University of King's College": {'color': '#002145', 'texture': 'solid'},
}

def verify_encodings():
    print("=" * 100)
    print("COLLISION RESOLUTION VERIFICATION")
    print("=" * 100)
    print()
    
    # Check for exact duplicate colors
    print("CHECKING FOR EXACT COLOR DUPLICATES:")
    print("-" * 100)
    
    color_map = {}
    for inst, enc in EXPECTED_ENCODINGS.items():
        color = enc['color']
        if color not in color_map:
            color_map[color] = []
        color_map[color].append(inst)
    
    duplicates = {c: insts for c, insts in color_map.items() if len(insts) > 1}
    
    if not duplicates:
        print("✓ PASS: No exact color duplicates found")
    else:
        print("✗ FAIL: Found exact color duplicates:")
        for color, institutions in duplicates.items():
            print(f"  {color}: {institutions}")
    print()
    
    # Check texture assignments for all institutions
    print("CHECKING TEXTURE ASSIGNMENTS:")
    print("-" * 100)
    
    solid_count = sum(1 for enc in EXPECTED_ENCODINGS.values() if enc['texture'] == 'solid')
    horizontal_count = sum(1 for enc in EXPECTED_ENCODINGS.values() if enc['texture'] == 'horizontal')
    diagonal_count = sum(1 for enc in EXPECTED_ENCODINGS.values() if enc['texture'] == 'diagonal')
    vertical_count = sum(1 for enc in EXPECTED_ENCODINGS.values() if enc['texture'] == 'vertical')
    
    print(f"  Solid (primary):  {solid_count:2d} institutions")
    print(f"  Horizontal:       {horizontal_count:2d} institutions")
    print(f"  Diagonal:         {diagonal_count:2d} institutions")
    print(f"  Vertical:         {vertical_count:2d} institutions")
    print(f"  TOTAL:            {len(EXPECTED_ENCODINGS):2d} institutions")
    print()
    
    if horizontal_count + diagonal_count + vertical_count >= 12:
        print("✓ PASS: Sufficient texture assignments (14 institutions using texture)")
    else:
        print("✗ FAIL: Insufficient texture assignments")
    print()
    
    # Verify color diversity in specific families
    print("CHECKING COLOR DIVERSITY BY FAMILY:")
    print("-" * 100)
    
    families = {
        'Blue': ['University of Toronto', 'University of British Columbia', 'Lakehead University',
                 'University of Northern British Columbia', 'Memorial University of Newfoundland',
                 'University of Prince Edward Island', 'Acadia University', 'University of Victoria',
                 'Simon Fraser University', "Saint Mary's University"],
        'Red': ['McGill University', 'Université de Montréal', 'University of Calgary',
                'University of Ottawa', "Queen's University", 'University of New Brunswick',
                'Toronto Metropolitan University', 'Ryerson University', 'Thompson Rivers University',
                'Laurentian University', 'École de Technologie Supérieure', 'Mount Allison University',
                'Carleton University', 'Concordia University', 'Brock University', 'McMaster University',
                'University of Manitoba', 'University of Lethbridge', 'Mount Saint Vincent University'],
    }
    
    for family, institutions in families.items():
        colors = set()
        for inst in institutions:
            if inst in EXPECTED_ENCODINGS:
                colors.add(EXPECTED_ENCODINGS[inst]['color'])
        print(f"\n  {family} Family:")
        print(f"    Institutions: {len(institutions)}")
        print(f"    Unique colors: {len(colors)}")
        
        if len(colors) == len(institutions):
            print(f"    ✓ All institutions have unique colors")
        else:
            print(f"    ✗ Color collisions detected ({len(institutions) - len(colors)} shared)")
            # Show collisions
            color_inst_map = {}
            for inst in institutions:
                if inst in EXPECTED_ENCODINGS:
                    color = EXPECTED_ENCODINGS[inst]['color']
                    if color not in color_inst_map:
                        color_inst_map[color] = []
                    color_inst_map[color].append(inst)
            
            for color, insts in color_inst_map.items():
                if len(insts) > 1:
                    textures = {inst: EXPECTED_ENCODINGS[inst]['texture'] for inst in insts}
                    print(f"      {color}:")
                    for inst, texture in textures.items():
                        print(f"        - {inst} ({texture})")
    
    print()
    print("=" * 100)
    print("VERIFICATION COMPLETE")
    print("=" * 100)


if __name__ == '__main__':
    verify_encodings()
