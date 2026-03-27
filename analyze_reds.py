import colorsys

reds = {
    "Queen's University": '#B30838',
    'University of Calgary': '#D50032',
    'McGill University': '#ED1B2F',
    'University of New Brunswick': '#DC143C',
    'Université de Montréal': '#ED1C24',
    'Toronto Metropolitan University': '#CC0000',
    'University of Ottawa': '#E31837',
    'Carleton University': '#800000',
    'Concordia University': '#8C1515',
    'University of Manitoba': '#C41E3A',
    'Simon Fraser University': '#CC0633',
    'Laurentian University': '#DC143C',
    'Mount Allison University': '#C41E3A',
}

print('Current Red-Family Encodings (HSL for perceptual analysis):')
print('Institution | Hex Color | RGB | HSL (H°, S%, L%)')
print('-' * 90)

for inst, hex_color in sorted(reds.items()):
    r = int(hex_color[1:3], 16)
    g = int(hex_color[3:5], 16)
    b = int(hex_color[5:7], 16)
    h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
    h_deg = h * 360 if h is not None else 0
    s_pct = s * 100
    l_pct = l * 100
    print(f'{inst[:35]:35} | {hex_color} | ({r:3}, {g:3}, {b:3}) | ({h_deg:5.1f}°, {s_pct:5.1f}%, {l_pct:5.1f}%)')

print('\n\nDuplicate/Collision Analysis:')
print('- University of New Brunswick & Laurentian University: Both #DC143C')
print('- University of Manitoba & Mount Allison University: Both #C41E3A')
print('- Toronto Metropolitan & Thompson Rivers & Ryerson: All #CC0000')
print('\nSimilar colors (hard to distinguish):')
print('- McGill (#ED1B2F) vs Université de Montréal (#ED1C24): EXTREMELY similar (~1 digit diff)')
print('- McGill (#ED1B2F) vs University of Ottawa (#E31837): Very similar (both orange-red)')
print('- University of Calgary (#D50032) vs University of New Brunswick (#DC143C): Similar')
