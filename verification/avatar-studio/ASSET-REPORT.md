# 3D Avatar Asset Verification — 2026-10-18

## Delivered and frozen

Two actual, skinned, self-contained GLB adult fashion avatars are published in `frontend/public/models/avatar/`. They use official MakeHuman / MPFB CC0 graphical assets; no user photographs, scans, face reconstruction, online avatar account or image-to-3D API was used. The full license and all source credits are distributed beside the files.

| Asset | Bytes | SHA-256 | Bones | Layers |
| --- | ---: | --- | ---: | --- |
| female.glb | 10,906,708 | `2f42454d5a21d39e3005416f6d4e952843686c4f80a2b8060e0e8c85be876f4a` | 53 | body, base, hair, tops, bottoms, dresses, outerwear, shoes |
| male.glb | 9,474,732 | `e805df1a0ab1dc94d0e94dc83327b7561ea003b112b9d0e1739682ae59fa380a` | 53 | body, base, hair, tops, bottoms, outerwear, shoes |

Female: 11 meshes / 13 materials; male: 10 meshes / 11 materials. Both use six embedded images; opaque skin/cloth images use JPEG quality 92 and alpha hair/brow/lash images remain PNG. GLBs contain no external buffer or image URI. Core glTF plus `KHR_materials_ior` and `KHR_materials_specular` are supported by the project's installed Three.js GLTFLoader.

## Source and rights

The MPFB source snapshot was downloaded from the official `master` archive and resolves to commit `3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf` (GitHub ZIP comment). `PROVENANCE.json` records the actual download URL and archive hash, the resolved immutable commit, an immutable archive URL for reproduction, and hashes of 97 selected graphical asset files.

Primary evidence: [upstream split license](https://github.com/makehumancommunity/mpfb2/blob/3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf/LICENSE.md), [CC0 asset license](https://github.com/makehumancommunity/mpfb2/blob/3af0cd5a2ffba072e93a34e5f6f494fdc4813ddf/LICENSE.ASSETS.md), [official license page](https://static.makehumancommunity.org/about/license.html), and the official CC0 pack listings: [system](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html), [shirts](https://static.makehumancommunity.org/assets/assetpacks/shirts01.html), [pants](https://static.makehumancommunity.org/assets/assetpacks/pants01.html), [dress](https://static.makehumancommunity.org/assets/assetpacks/dress01.html), [suits](https://static.makehumancommunity.org/assets/assetpacks/suits01.html). Core source mesh and asset `.mhclo` / `.mhmat` files also carry CC0 headers. MakeHuman / MPFB code was used only for offline authoring; its program is not a web runtime dependency. Its separate GPL program license does not replace the explicit CC0 license of graphical assets and output.

Original credits: MakeHuman / MPFB Community; Data Collection AB; Joel Palmius; Jonas Hauquier; Margaret Toigo for selected fashion items. No Mixamo, ReadyPlayerMe, third-party restrictive avatar model or commercial image-to-3D model is included.

## Geometry and fit verification

The avatars have real full-body and facial geometry, eyes, brows, lashes, alpha hair and fitted clothing meshes. The body uses an adult macro shape, subtle facial targets and one subdivision step. The GLB exports preserve 53-bone skinning, Y-up and metric scale; front is +Z. The offline Blender previews apply a relaxed upper-arm pose, but the animation-disabled GLB export stores the binding A-pose. Browser verification detected this difference; the application scene owns the runtime arm redirection and posture verification. Do not apply both an asset pose bake and a runtime rotation without retesting. The female and male identities are fictional assembled appearances.

All node layer keys use `extras.avatarLayer`. The closed blazer includes its own shirt and tie and sets **`extras.avatarReplacesTops=true`**. Runtime must hide independent Tops when showing this layer and must preserve BaseCoverage. The blazer's main connected shell has its own recolorable neutral fabric material; shirt, tie and buttons retain source materials with `avatarRecolor=false`. Shoes are clean neutral ivory with `avatarRecolor=true` so the visible shoe color control can work. Body, hair, eyes, brows, lashes and coverage retain protected colors.

Local Blender Cycles renders were inspected after each final fit correction: female halter dress and two-piece look, female closed blazer with independent Tops hidden, and male crewneck/trousers. Corrected defects include legacy material alpha loss, overbright hair grazing specular, high sport sock geometry, trouser waistband clipping through male sweater, displaced coat cuffs, and inner camisole protruding through a closed blazer. Final previews show clean waist/cuff fit and intact legs/ankles. Stage lighting and editorial poses are supplied by the application independently.

Verification images are `female-dress-preview.png`, `female-blazer-preview.png`, `female-preview.png`, `female-face.png`, `male-preview.png`, `male-face.png`. Structural validation checks GLB signature/version/declared length, embedded images/buffers, nonempty skinning and layer metadata. Browser GPU and interaction checks are performed by the root task against the published files.

## Reproduction and boundaries

The review copy is `build-avatars.py`; the executable working copy and downloaded resources are under `research-assets/`. From the repository root:

```sh
/opt/homebrew/bin/blender --background --factory-startup --python verification/avatar-studio/research-assets/build-avatars.py -- female
/opt/homebrew/bin/blender --background --factory-startup --python verification/avatar-studio/research-assets/build-avatars.py -- male
python3 verification/avatar-studio/research-assets/write-provenance.py
```

The exact source snapshot, offline export recipe, selected asset downloads and output hashes are recorded locally. Large raw archives and working `.blend` files remain in the verification research directory, not in the frontend runtime.

The female supports a dress layer; the male does not. UI must disclose and enforce that capability. Clothing is a curated built-in 3D template with adjustable colors and layer combinations; it does **not** automatically reconstruct arbitrary uploaded garment geometry, measure a real person, or prove physical sizing/cloth simulation. Photographic AI try-on remains the separate working fitting-room flow.

## Follow-up: male duplicate trousers removed after browser evidence

The root task observed dark polygon patches on the male upper trousers during actual GPU rendering. Source component inspection proved that the source male suit still contained its original 8,123-vertex trousers: its top was 1.165588 m, above the female-derived 1.10 m removal threshold. Original authoring logs recorded `removed 0`. This was a duplicate garment, independently of the separate multi-material Group inheritance issue fixed in the application scene.

The male asset alone was rebuilt to remove the identified connected trousers component. Classification now compares the component's grounded minimum and upper bound with the actual male body height; the build asserts exactly the known 8,123 source vertices are removed. No blanket clipping or material/shadow workaround was added. Female binary was unchanged in that male-only rebuild; its subsequent rear-fit revision is documented below. All node/material names, 53 bones, color flags and `avatarReplacesTops=true` remain intact.

The new regression first failed on the old male (`suit-components-red.log`), then passed for both source models (`suit-components-green.log`). Male Outerwear minimum height increased to 0.919712 m; no lower-leg component remains. The final source has 25,175 outerwear vertices. A closed-blazer preview with Tops hidden (`male-blazer-preview.png`) was visually inspected: trousers and sleeves are clean. Actual runtime pose and multi-material inheritance verification remains with the root browser test. New male GLB: 9,474,732 bytes, SHA-256 `e805df1a0ab1dc94d0e94dc83327b7561ea003b112b9d0e1739682ae59fa380a`.

## Follow-up: female rear hair, exact covered skin and conditional trouser fit

Actual GPU rear evidence exposed hair cards passing through the closed coat and smaller elbow/hip skin overlap. Cycles A/B renders independently hid Hair and BaseCoverage: removing Hair removed the large dark shapes, whereas removing BaseCoverage did not. This establishes geometric hair overlap as the main source. The independent alpha-card shadow correction belongs to the runtime scene.

Only lower rear hair was fitted outward to the actual coat; 1,495 vertices moved by at most 0.076126 m while front/scalp coordinates stayed identical. Source regression checked 1,569 lower rear samples and found zero remaining penetration violations. The body keeps all 53,514 vertices and 53,512 faces with original normals. Exactly 10,177 authored covered faces use `Body_OuterwearCovered_Material` with `avatarHiddenByOuterwear=true` and `avatarRecolor=false`; no head/hand/leg protected vertices enter this material. Runtime hides this material only while closed Outerwear is shown and restores it otherwise. Body exports two material primitives; layer ownership remains on the Body node. Always-on BaseCoverage remains present.

A static upper-trouser inset initially fitted beneath the coat but introduced a coat-off coverage intersection. The final native morph resolves both states: original trousers remain Basis; `Bottoms.extras.avatarOuterwearFitMorph=OuterwearLayerFit` refers to mesh `targetNames` with one zero-default target. Runtime sets this target to 1 with outerwear and 0 without, preserving unrelated morphs. The target changes only 690 upper-trouser vertices (maximum shift 0.0206985 m); lower-leg geometry stays unchanged.

The regression first failed on the old female (`female-rear-red.log`), then passed on the final source (`female-rear-green.log`). It checks precise coverage metadata, unchanged full body geometry, exclusion of protected skin, hair clearance, native morph declaration, nonzero target deltas and the original Basis/default-zero state. Final essential Cycles proof images were visually inspected: `female-final-morph-coat-1-back.png`, `female-final-morph-coat-1-side.png`, and `female-final-morph-coat-0-side.png`. They show clean back/side coat fit and restored coat-off trousers. These supersede earlier static-fit candidate images. Final native GPU validation of both runtime poses remains with the root task.

Final female: 10,906,708 bytes, SHA-256 `2f42454d5a21d39e3005416f6d4e952843686c4f80a2b8060e0e8c85be876f4a`. Male stays frozen at `e805df1a0ab1dc94d0e94dc83327b7561ea003b112b9d0e1739682ae59fa380a`. Source and export script hashes are refreshed in PROVENANCE.json.
