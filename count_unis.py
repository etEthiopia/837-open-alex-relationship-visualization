import re
p=open('app/lib/universityVisualEncoding.ts').read()
section=p.split('const UNIVERSITY_BRAND_COLORS')[1].split('};')[0]
names=[m.group(1) for m in re.finditer(r"'([^']+)'\s*:\s*'#[0-9A-Fa-f]{6}'", section)]
print('count', len(names))
print('has dup', len(names)!=len(set(names)))
print(names[:5], names[-5:])