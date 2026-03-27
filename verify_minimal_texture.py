#!/usr/bin/env python3
"""
Verify the minimal texture implementation - check which universities get textures.
"""

def main():
    # Read the current texture assignment map from the TypeScript file
    with open('app/lib/universityVisualEncoding.ts', 'r') as f:
        content = f.read()

    # Find the TEXTURE_ASSIGNMENT_MAP
    start = content.find('const TEXTURE_ASSIGNMENT_MAP:')
    end = content.find('};', start) + 2

    map_section = content[start:end]

    # Parse the assignments
    lines = map_section.split('\n')
    texture_assignments = {}

    for line in lines:
        line = line.strip()
        # Skip comments and empty lines
        if line.startswith('//') or not line or line.startswith('const') or line.startswith('}'):
            continue
        if ':' in line:
            parts = line.split(':')
            if len(parts) == 2:
                name = parts[0].strip().strip("'\"")
                texture_part = parts[1].strip().strip(',').strip("'\"")
                # Remove any trailing comments
                if '//' in texture_part:
                    texture_part = texture_part.split('//')[0].strip().strip("'\"")
                if name and texture_part:
                    texture_assignments[name] = texture_part

    print("=== MINIMAL TEXTURE ASSIGNMENT VERIFICATION ===")
    print(f"Total universities with texture assignments: {len(texture_assignments)}")
    print()

    # Count by texture type
    texture_counts = {}
    for name, texture in texture_assignments.items():
        texture_counts[texture] = texture_counts.get(texture, 0) + 1

    print("TEXTURE DISTRIBUTION:")
    for texture, count in sorted(texture_counts.items()):
        print(f"  {texture}: {count} universities")

    print()
    print("UNIVERSITIES WITH TEXTURE:")
    for name, texture in sorted(texture_assignments.items()):
        print(f"  {name}: {texture}")

    print()
    total_universities = 41  # We know this from previous analysis
    texture_percentage = (len(texture_assignments) / total_universities) * 100
    print(".1f")
    if texture_percentage <= 20:
        print("✅ Within target (<20%) - Color is PRIMARY encoding channel")
    else:
        print("❌ Exceeds target - Texture still dominates")

if __name__ == "__main__":
    main()