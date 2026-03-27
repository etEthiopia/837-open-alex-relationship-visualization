import json  
from pathlib import Path  
authors = json.loads(Path('public/data/authors.json').read_text(encoding='utf-8'))  
authorships = json.loads(Path('public/data/authorships.json').read_text(encoding='utf-8'))  
insts = set()  
for a in authors:  
   inst = a.get('last_known_institution')  
   if inst and inst.get('display_name'):  
       insts.add(inst['display_name'])  
for a in authorships:  
   for i in a.get('last_known_institutions', []):  
       if i and i.get('display_name'):  
           insts.add(i['display_name'])  
names = sorted(insts)
print('Total unique names', len(names))
patterns = ['UBC', 'University of British Columbia', 'Toronto', 'Ryerson', 'Metropolitan']
candidates = [n for n in names if any(p.lower() in n.lower() for p in patterns)]
print('UBC/Toronto-related candidates', len(candidates))
print('\n'.join(candidates))

def simple_norm(name):
    return ' '.join(name.replace('Hospital', '').replace('Health Sciences Centre', '').split())

norm_map = {}
for n in names:
    k = simple_norm(n).lower()
    norm_map.setdefault(k, []).append(n)

similar = [(k, v) for k, v in norm_map.items() if len(v) > 1]
print('Potential duplicates based on simple normalization', len(similar))
for k, v in similar[:60]:
    print('---', k)
    print(' | '.join(v))  
