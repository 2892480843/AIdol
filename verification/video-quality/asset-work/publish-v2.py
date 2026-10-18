from pathlib import Path
import json,shutil,hashlib
HERE=Path(__file__).resolve().parent
OLD=HERE.parents[1]/'avatar-studio/research-assets'
OUT=HERE.parents[2]/'frontend/public/models/avatar/v2'
audit=json.loads((HERE.parent/'assets-audit.json').read_text())
assert set(audit)=={'female','male'},'Both sexes must be verified before publishing'
models=[]
for sex,record in audit.items():
 src=HERE/'generated'/f'{sex}.glb'
 assert hashlib.sha256(src.read_bytes()).hexdigest()==record['sha256']
 shutil.copyfile(src,OUT/src.name)
 models.append(dict(file=src.name,**{k:record[k] for k in ['bytes','sha256','boneCount','meshCount','materialCount','imageCount','normalMapCount','layers']}))
shutil.copyfile(OLD/'mpfb2-master/LICENSE.ASSETS.md',OUT/'LICENSE-CC0.txt')
source_files=[]
for root in [HERE/'sources',OLD/'system-assets']:
 for file in root.rglob('*'):
  if file.is_file():source_files.append({'file':str(file.relative_to(HERE.parents[2])),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
old_provenance=json.loads((OLD/'generated/PROVENANCE.json').read_text())
provenance={'upstream':old_provenance['upstream'],'authoringScriptSha256':hashlib.sha256((HERE/'build-v2.py').read_bytes()).hexdigest(),'fitScriptSha256':hashlib.sha256((HERE/'finalize-v2.py').read_bytes()).hexdigest(),'coverageScriptSha256':hashlib.sha256((HERE/'apply-coverage-v2.py').read_bytes()).hexdigest(),'necklineRefinementScriptSha256':hashlib.sha256((HERE/'refine-knit-neckline.py').read_bytes()).hexdigest(),'conditionalCoverage':json.loads((HERE.parent/'assets-coverage.json').read_text()),'license':'CC0-1.0','generated':'2026-10-18','generator':'Blender 5.1.2 / MPFB2 local offline','hairLicenseEvidence':{'asset':'Elvaerwyn French braid 01 variation','authorPage':'http://www.makehumancommunity.org/clothes/french_braid_01_variation.html','authorPageSha256':hashlib.sha256((HERE/'frenchbraid-author-page.html').read_bytes()).hexdigest(),'authorAndOfficialPackLicense':'CC0 - Creative Commons Zero','legacyHeaderDiscrepancy':'MHCLO retains an old AGPL3 export-template header; both the author asset listing and official checked pack explicitly grant CC0. Original source header is retained unchanged.'},'sources':['https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html','https://static.makehumancommunity.org/assets/assetpacks/shirts01.html','https://static.makehumancommunity.org/assets/assetpacks/pants01.html','https://static.makehumancommunity.org/assets/assetpacks/dress01.html','https://static.makehumancommunity.org/assets/assetpacks/suits01.html','https://static.makehumancommunity.org/assets/assetpacks/skirts01.html','https://static.makehumancommunity.org/assets/assetpacks/shoes01.html','https://static.makehumancommunity.org/assets/assetpacks/hair01.html'],'models':models,'sourceFiles':source_files,'downloadManifestSha256':hashlib.sha256((HERE/'download-manifest.json').read_bytes()).hexdigest(),'modifications':['adult fashion proportions and facial target combinations','new fitted short-sleeve, tiered mini skirt, cargo trousers, polo, knit, two dresses, boots and ballet flat meshes','neutralized authored fabric diffuse maps preserving texture detail and normal maps','plane-bisected cropped tee hem','pelvis-only opaque fallback coverage kept beneath fitted garments','clean French braid and textured cropped male hair','intact conditional closed-blazer coverage and authored trouser fit morph','per-variant conditional skin coverage for fully covered knit sleeves and closed ankle boots; intact face/neck/hands and complete geometry retained','embedded textures and 53 joint game-engine skinning']}
(OUT/'PROVENANCE.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
(OUT/'NOTICE.txt').write_text('''Wardrowbe adult fashion avatars v2 / CC0-1.0

Original virtual adult templates assembled and fitted locally with MakeHuman/MPFB.
These avatars are not real-person scans or reconstructions of uploaded photographs.
Garments are sample style meshes; they do not reconstruct the exact uploaded clothes.

Authors: MakeHuman / MPFB Community; Data Collection AB; Joel Palmius;
Jonas Hauquier; Margaret Toigo (MRT); Cortu Johnstone; Elvaerwyn (French braid and male tee); namuhekam (polo).
The official asset pack pages list each asset as CC0. The French braid author page also explicitly grants CC0; its MHCLO file retains a legacy AGPL3 export-template header. That discrepancy and author-page evidence are documented in PROVENANCE.json. Original author/license comments
are retained in the offline source files; checksums and source URLs are in PROVENANCE.json.
MPFB program software is GPL-3.0; it is an offline authoring tool and is not bundled in
this web runtime. The graphical assets and this output are separately CC0-1.0.

Integration contract: extras.avatarLayer identifies the slot; extras.avatarVariant
identifies a real cut. Body material extras.avatarHiddenByVariants lists active slot:variant keys to hide only under the actual visible garment. Knit source has no delete_verts, so coverage follows fully covered arm/chest bone regions bounded by the fitted hem/collar; closed boots use authored delete groups. Head, neck and hands remain protected. Show exactly one variant per active slot. Dress replaces top
and bottom. Closed blazer contains its own shirt/tie and replaces independent top.
Body, base, eyes, brows, lashes and hair remain protected. The female tailored trouser
OuterwearLayerFit morph applies only while closed outerwear is shown. Materials with
avatarHiddenByOuterwear are conditionally hidden only with closed blazer.

CC0 text: LICENSE-CC0.txt
Models and official-source checksums: PROVENANCE.json
Six preset slot mappings: catalogue.json
''',encoding='utf-8')
print(json.dumps(models,indent=2))
