import * as THREE from "three";
import { clampAvatarZoom, type AvatarGarments } from "@/lib/avatar-studio";
import type { AvatarLayer, AvatarPalette } from "./scene-types";

const layers = new Set<AvatarLayer>([
  "tops",
  "bottoms",
  "dresses",
  "outerwear",
  "shoes",
  "body",
  "hair",
  "base",
]);

/** GLB extras win over names so a body proxy cannot accidentally become clothing. */
export function avatarLayer(object: THREE.Object3D): AvatarLayer {
  // GLTFLoader wraps a multi-primitive node in a Group and puts its extras there.
  // The nearest explicit node therefore owns the layer for unnamed primitive meshes.
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const explicit: unknown = node.userData.avatarLayer;
    if (typeof explicit === "string" && layers.has(explicit as AvatarLayer))
      return explicit as AvatarLayer;
  }
  const name = object.name.toLowerCase();
  const rules: [RegExp, AvatarLayer][] = [
    [/(^|[_ .-])(outerwear|coat|jacket|blazer)([_ .-]|$)/, "outerwear"],
    [/(^|[_ .-])(dresses|dress)([_ .-]|$)/, "dresses"],
    [/(^|[_ .-])(bottoms|pants|trousers|jeans|skirt)([_ .-]|$)/, "bottoms"],
    [/(^|[_ .-])(tops|top|shirt|tshirt|sweater)([_ .-]|$)/, "tops"],
    [/(^|[_ .-])(shoes|shoe|sneakers|boots)([_ .-]|$)/, "shoes"],
    [/(^|[_ .-])(hair)([_ .-]|$)/, "hair"],
    [/(^|[_ .-])(body|skin)([_ .-]|$)/, "body"],
    [/(^|[_ .-])(base|underwear)([_ .-]|$)/, "base"],
  ];
  return rules.find(([pattern]) => pattern.test(name))?.[1] ?? "other";
}

export function normalizedAvatarRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
}

export function safeAvatarZoom(value: number): number {
  return clampAvatarZoom(value);
}

/** A multi-material glTF garment puts metadata on the parent, not each primitive. */
function garmentVariant(object: THREE.Object3D): string {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    const value: unknown = node.userData.avatarVariant;
    if (typeof value === "string") return value;
  }
  return "default";
}

export function applyAvatarWardrobe(
  root: THREE.Object3D,
  palette: AvatarPalette,
  dressMode: boolean,
  showOuterwear: boolean,
  choices: AvatarGarments = {},
) {
  const available = new Map<AvatarLayer, Set<string>>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const layer = avatarLayer(object);
    if (!(layer in palette)) return;
    const variants = available.get(layer) ?? new Set<string>();
    variants.add(garmentVariant(object));
    available.set(layer, variants);
  });
  const chosen = new Map<AvatarLayer, string>();
  available.forEach((variants, layer) => {
    const requested = choices[layer as keyof AvatarPalette];
    chosen.set(
      layer,
      requested && variants.has(requested)
        ? requested
        : variants.has("default")
          ? "default"
          : variants.values().next().value!,
    );
  });
  const selectedVariant = (object: THREE.Object3D) => {
    const selected = chosen.get(avatarLayer(object));
    return selected === undefined || garmentVariant(object) === selected;
  };
  let hasDress = false;
  let outerwearReplacesTops = false;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const layer = avatarLayer(object);
    if (layer === "dresses" && selectedVariant(object)) hasDress = true;
    if (layer === "outerwear" && showOuterwear && selectedVariant(object)) {
      for (
        let node: THREE.Object3D | null = object;
        node && node !== root.parent;
        node = node.parent
      ) {
        if (
          node.userData.avatarReplacesTops === true &&
          avatarLayer(node) === "outerwear"
        ) {
          outerwearReplacesTops = true;
          break;
        }
      }
    }
  });
  const wearingDress = dressMode && hasDress;
  const visibleVariants = new Set<string>();
  chosen.forEach((variant, layer) => {
    if (layer === "dresses" && !wearingDress) return;
    if ((layer === "tops" || layer === "bottoms") && wearingDress) return;
    if (layer === "tops" && outerwearReplacesTops) return;
    if (layer === "outerwear" && !showOuterwear) return;
    visibleVariants.add(`${layer}:${variant}`);
  });
  root.traverse((object) => {
    const layer = avatarLayer(object);
    const variantVisible = selectedVariant(object);
    if (layer === "dresses") object.visible = wearingDress && variantVisible;
    // Some closed blazers include their own shirt; the author declares that fit constraint.
    else if (layer === "tops")
      object.visible =
        !wearingDress && !outerwearReplacesTops && variantVisible;
    else if (layer === "bottoms")
      object.visible = !wearingDress && variantVisible;
    else if (layer === "outerwear")
      object.visible = showOuterwear && variantVisible;
    else if (layer === "shoes") object.visible = variantVisible;
    if (!(object instanceof THREE.Mesh)) return;
    for (
      let node: THREE.Object3D | null = object;
      node && node !== root.parent;
      node = node.parent
    ) {
      const fit: unknown = node.userData.avatarOuterwearFitMorph;
      if (typeof fit !== "string") continue;
      const index = object.morphTargetDictionary?.[fit];
      const influences = object.morphTargetInfluences;
      if (
        typeof index === "number" &&
        Number.isInteger(index) &&
        index >= 0 &&
        influences &&
        index < influences.length
      )
        influences[index] = showOuterwear ? 1 : 0;
      break;
    }
    object.castShadow = true;
    object.receiveShadow = true;
    const color =
      layer in palette ? palette[layer as keyof AvatarPalette] : null;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      // Authored clothing masks affect only covered faces, preserving the rest of the skin mesh.
      const coveredBy: unknown = material.userData.avatarHiddenByVariants;
      const authoredVariants = Array.isArray(coveredBy) ? coveredBy : [];
      if (
        material.userData.avatarHiddenByOuterwear === true ||
        Array.isArray(coveredBy)
      )
        material.visible = !(
          (material.userData.avatarHiddenByOuterwear === true &&
            showOuterwear) ||
          authoredVariants.some(
            (variant) =>
              typeof variant === "string" && visibleVariants.has(variant),
          )
        );
      // glTF BLEND cards otherwise cast solid rectangles: shadow shaders require alphaTest.
      if (
        material instanceof THREE.MeshStandardMaterial &&
        material.transparent &&
        material.alphaTest === 0 &&
        (material.map || material.alphaMap)
      )
        material.alphaTest = 0.25;
      // Trim/eye/skin materials embedded in a garment retain their authored colors.
      if (
        !color ||
        !/^#[0-9a-f]{6}$/i.test(color) ||
        material.userData.avatarRecolor === false
      )
        continue;
      if (material instanceof THREE.MeshStandardMaterial)
        material.color.set(color);
    }
  });
}

/** Keep floor placement and proportions independent of the source asset's units. */
export function normalizeAvatarModel(model: THREE.Object3D): THREE.Group {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y < 0.001)
    throw new Error("Invalid avatar bounds");
  const scale = 3.2 / size.y;
  const center = bounds.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.name = "normalized_avatar";
  wrapper.scale.setScalar(scale);
  wrapper.add(model);
  // Translation belongs to the wrapper; source skeleton transforms remain intact.
  wrapper.position.set(
    -center.x * scale,
    -bounds.min.y * scale,
    -center.z * scale,
  );
  wrapper.updateMatrixWorld(true);
  return wrapper;
}

const restBones = new WeakMap<THREE.Bone, THREE.Quaternion>();

function pointBoneToward(
  bone: THREE.Bone,
  child: THREE.Bone,
  direction: THREE.Vector3,
) {
  if (!bone.parent) return;
  const current = child
    .getWorldPosition(new THREE.Vector3())
    .sub(bone.getWorldPosition(new THREE.Vector3()));
  if (current.lengthSq() < 0.000001) return;
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentInverse = bone.parent
    .getWorldQuaternion(new THREE.Quaternion())
    .invert();
  const delta = new THREE.Quaternion().setFromUnitVectors(
    current.normalize(),
    direction.normalize(),
  );
  bone.quaternion
    .copy(parentInverse.multiply(delta).multiply(world))
    .normalize();
  bone.updateMatrixWorld(true);
}

/** Rest-relative edits avoid cumulative skeleton drift when controls are changed. */
export function applyAvatarPose(
  root: THREE.Object3D,
  pose: "relaxed" | "editorial",
) {
  let posed = false;
  const bones = new Map<string, THREE.Bone>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Bone)) return;
    bones.set(object.name.toLowerCase(), object);
    let rest = restBones.get(object);
    if (!rest) {
      rest = object.quaternion.clone();
      restBones.set(object, rest);
    }
    object.quaternion.copy(rest);
    if (pose !== "editorial") return;
    const name = object.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    let offset: THREE.Euler | null = null;
    if (/^(spine03|spine3|chest|mixamorigspine2)$/.test(name))
      offset = new THREE.Euler(0, -0.08, -0.025);
    else if (/^(neck01|neck|mixamorigneck)$/.test(name))
      offset = new THREE.Euler(0, 0.065, 0.015);
    else if (/^(head|mixamorighead)$/.test(name))
      offset = new THREE.Euler(-0.018, 0.055, 0.02);
    if (offset) {
      object.quaternion.multiply(new THREE.Quaternion().setFromEuler(offset));
      posed = true;
    }
  });
  root.rotation.z = 0;
  root.updateMatrixWorld(true);
  const rootOrientation = root.getWorldQuaternion(new THREE.Quaternion());
  for (const side of ["l", "r"]) {
    const upper = bones.get(`upperarm_${side}`);
    const lower = bones.get(`lowerarm_${side}`);
    const hand = bones.get(`hand_${side}`);
    if (!upper || !lower || !hand) continue;
    const shoulder = root.worldToLocal(
      upper.getWorldPosition(new THREE.Vector3()),
    );
    const sign = shoulder.x < 0 ? -1 : 1;
    const editorial = pose === "editorial";
    // Retarget actual joint directions, independent of Blender's local bone axes.
    // The avatar-space targets rotate with the turntable, so every view keeps the same pose.
    const upperDirection = new THREE.Vector3(
      sign * (editorial ? (side === "l" ? 0.2 : 0.14) : 0.14),
      -1,
      editorial ? 0.035 : 0.015,
    )
      .normalize()
      .applyQuaternion(rootOrientation);
    pointBoneToward(upper, lower, upperDirection);
    const forearmDirection = new THREE.Vector3(
      sign * (editorial && side === "l" ? 0.025 : 0.07),
      -1,
      editorial ? 0.11 : 0.06,
    )
      .normalize()
      .applyQuaternion(rootOrientation);
    pointBoneToward(lower, hand, forearmDirection);
    posed = true;
  }
  // Non-rigged assets still get a small whole-body editorial lean, not fake skinning.
  root.rotation.z = pose === "editorial" && !posed ? -0.018 : 0;
  root.updateMatrixWorld(true);
}

const disposedResources = new WeakSet<object>();
const closedImages = new WeakSet<object>();

function closeImage(image: unknown) {
  if (Array.isArray(image)) {
    image.forEach(closeImage);
    return;
  }
  if (!image || typeof image !== "object" || closedImages.has(image)) return;
  const candidate = image as { close?: unknown };
  if (typeof candidate.close === "function") {
    closedImages.add(image);
    candidate.close();
  }
}

function disposeOnce(resource: { dispose: () => void }) {
  if (disposedResources.has(resource)) return;
  disposedResources.add(resource);
  resource.dispose();
}

/** GLTF ImageBitmap sources need explicit close in addition to Texture.dispose. */
export function disposeAvatarObject(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const surfaces = Array.isArray(object.material)
      ? object.material
      : [object.material];
    surfaces.forEach((material) => materials.add(material));
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const material of Array.from(materials)) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
        else if (Array.isArray(uniform.value))
          uniform.value.forEach((value) => {
            if (value instanceof THREE.Texture) textures.add(value);
          });
      }
    }
  }
  for (const skeleton of Array.from(skeletons)) {
    const boneTexture = skeleton.boneTexture;
    if (boneTexture && disposedResources.has(boneTexture))
      skeleton.boneTexture = null;
    disposeOnce(skeleton);
    if (boneTexture) disposedResources.add(boneTexture);
  }
  for (const texture of Array.from(textures)) {
    if (!disposedResources.has(texture)) {
      disposeOnce(texture);
      closeImage(texture.source?.data);
    }
  }
  geometries.forEach(disposeOnce);
  materials.forEach(disposeOnce);
  root.clear();
}
