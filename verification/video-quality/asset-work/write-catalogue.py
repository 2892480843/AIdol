import pathlib,json,re
HERE=pathlib.Path(__file__).resolve().parent
OUT=HERE.parents[2]/'frontend/public/models/avatar/v2'
# Mirrors frontend/lib/avatar-fashion.ts; all entries name real fitted meshes.
female={
'sweet':dict(tops='cropped-tee',bottoms='mini-skirt',dresses='shift',shoes='ballet-flats',outerwear='blazer'),
'minimal':dict(tops='camisole',bottoms='tailored',dresses='shift',shoes='ballet-flats',outerwear='blazer'),
'street':dict(tops='cropped-tee',bottoms='cargo',dresses='shift',shoes='ankle-boots',outerwear='blazer'),
'relaxed':dict(tops='knit',bottoms='tailored',dresses='shift',shoes='sneakers',outerwear='blazer'),
'elegant':dict(tops='camisole',bottoms='tailored',dresses='halter',shoes='ballet-flats',outerwear='blazer'),
'sport':dict(tops='cropped-tee',bottoms='cargo',dresses='shift',shoes='sneakers',outerwear='blazer')}
male={
'sweet':dict(tops='polo',bottoms='tailored',shoes='sneakers',outerwear='blazer'),
'minimal':dict(tops='polo',bottoms='tailored',shoes='ankle-boots',outerwear='blazer'),
'street':dict(tops='tee',bottoms='cargo',shoes='ankle-boots',outerwear='blazer'),
'relaxed':dict(tops='knit',bottoms='tailored',shoes='sneakers',outerwear='blazer'),
'elegant':dict(tops='polo',bottoms='tailored',shoes='ankle-boots',outerwear='blazer'),
'sport':dict(tops='tee',bottoms='cargo',shoes='sneakers',outerwear='blazer')}
OUT.mkdir(exist_ok=True,parents=True)
(OUT/'catalogue.json').write_text(json.dumps(dict(female=female,male=male),ensure_ascii=False,indent=2)+'\n')
