from pathlib import Path
import re,colorsys,json
root=Path(__file__).resolve().parents[2]
css=(root/'frontend/app/collage.css').read_text().split('}\n',1)[0]
tokens=dict(re.findall(r'--([a-z-]+): ([0-9.]+ [0-9.]+% [0-9.]+%);',css))
def rgb(v):
 h,s,l=map(float,v.replace('%','').split());return colorsys.hls_to_rgb(h/360,l/100,s/100)
def lum(v):
 c=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb(v)];return sum(x*y for x,y in zip(c,[.2126,.7152,.0722]))
pairs=[('background','foreground'),('card','card-foreground'),('popover','popover-foreground'),('primary','primary-foreground'),('secondary','secondary-foreground'),('muted','muted-foreground'),('accent','accent-foreground'),('destructive','destructive-foreground')]+[(f'tone-{x}',f'tone-{x}-foreground') for x in ['blush','lavender','mint','lemon','sky']]
results=[]
for bg,fg in pairs:
 a,b=lum(tokens[bg]),lum(tokens[fg]);ratio=(max(a,b)+.05)/(min(a,b)+.05);results.append({'background':bg,'foreground':fg,'contrast':round(ratio,2),'passesAA':ratio>=4.5})
Path(__file__).with_name('semantic-contrast.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'pairs':len(results),'all_pass':all(x['passesAA'] for x in results),'minimum':min(x['contrast'] for x in results)},indent=2))
assert all(x['passesAA'] for x in results)
