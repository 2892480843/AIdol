from pathlib import Path
from PIL import Image,ImageOps,ImageEnhance
import json
HERE=Path(__file__).resolve().parent
OLD=HERE.parents[1]/'avatar-studio/research-assets/system-assets'
OUT=HERE/'fabric-textures';OUT.mkdir(exist_ok=True)
paths={
'knit':OLD/'clothes/toigo_fisherman_sweater/shirt-knit.png',
'cargo':OLD/'clothes/cortu_cargo_pants/cargo_pants_diff.png',
}
for folder in (HERE/'sources/clothes').iterdir():
 if not folder.is_dir():continue
 key='mini-skirt' if folder.name=='toigo_tiered_mini_skirt' else 'ankle-boots-female' if folder.name=='toigo_ankle_boots_female' else 'ankle-boots-male' if folder.name=='toigo_ankle_boots_male' else 'ballet-flats' if folder.name=='toigo_ballet_flats' else 'polo' if folder.name=='namuhekam_male_polo_shirt' else None
 if not key:continue
 mhmat=next(folder.glob('*.mhmat'),None)
 if mhmat:
  for line in mhmat.read_text().splitlines():
   if line.startswith('diffuseTexture '):paths[key]=folder/line.split(' ',1)[1].strip()
for key,path in paths.items():
 if not path.exists():continue
 img=Image.open(path).convert('RGB');gray=ImageOps.grayscale(img)
 # Preserve authored stitch/fold contrast, neutralize source color so live swatches remain accurate.
 gray=ImageOps.autocontrast(gray,cutoff=1)
 gray=gray.point(lambda p:round(125+p*.50))
 if max(gray.size)>1024:gray.thumbnail((1024,1024))
 gray.convert('RGB').save(OUT/f'{key}.png')
print(paths)
