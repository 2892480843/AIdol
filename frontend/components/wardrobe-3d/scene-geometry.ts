import * as THREE from "three";
import type { RackSceneMode } from "./scene-types";

export type GarmentKind =
  | "tee"
  | "shirt"
  | "knit"
  | "coat"
  | "dress"
  | "pants"
  | "skirt"
  | "shoes"
  | "bag"
  | "accessory";

export function garmentKind(type: string): GarmentKind {
  const value = type.toLowerCase().replace(/[_\s]+/g, "-");
  if (/sneaker|shoe|boot|sandal|loafer|heel/.test(value)) return "shoes";
  if (/handbag|backpack|bag|tote|purse/.test(value)) return "bag";
  if (/trouser|pant|jean|short|legging/.test(value)) return "pants";
  if (/skirt/.test(value)) return "skirt";
  if (/dress|jumpsuit/.test(value)) return "dress";
  if (/coat|jacket|blazer|parka|outerwear|trench/.test(value)) return "coat";
  if (/sweater|cardigan|knit|hoodie|sweatshirt|fleece/.test(value))
    return "knit";
  if (/t-shirt|tshirt|tee|tank|top|polo/.test(value)) return "tee";
  if (/shirt|blouse/.test(value)) return "shirt";
  if (/scarf|hat|cap|belt|accessor/.test(value)) return "accessory";
  return "tee";
}

export type ClothProfile = {
  shoulder: number;
  waist: number;
  hem: number;
  length: number;
  neckline: number;
  fold: number;
};

export function clothProfile(kind: GarmentKind): ClothProfile {
  switch (kind) {
    case "coat":
      return {
        shoulder: 0.49,
        waist: 0.46,
        hem: 0.55,
        length: 2.03,
        neckline: 0.17,
        fold: 0.019,
      };
    case "dress":
      return {
        shoulder: 0.36,
        waist: 0.31,
        hem: 0.73,
        length: 2.25,
        neckline: 0.22,
        fold: 0.035,
      };
    case "skirt":
      return {
        shoulder: 0.33,
        waist: 0.46,
        hem: 0.65,
        length: 1.44,
        neckline: 0,
        fold: 0.035,
      };
    case "knit":
      return {
        shoulder: 0.48,
        waist: 0.45,
        hem: 0.45,
        length: 1.51,
        neckline: 0.15,
        fold: 0.024,
      };
    case "shirt":
      return {
        shoulder: 0.45,
        waist: 0.42,
        hem: 0.48,
        length: 1.63,
        neckline: 0.17,
        fold: 0.021,
      };
    default:
      return {
        shoulder: 0.46,
        waist: 0.43,
        hem: 0.47,
        length: 1.49,
        neckline: 0.19,
        fold: 0.025,
      };
  }
}

/** A closed, double-sided cloth volume. Every row has its own contour and folds. */
export function createClothGeometry(
  profile: ClothProfile,
): THREE.BufferGeometry {
  const columns = 28;
  const rows = 36;
  const positions: number[] = [];
  const indices: number[] = [];
  const uv: number[] = [];
  const stride = columns + 1;
  const faceSize = stride * (rows + 1);

  for (let face = 0; face < 2; face++) {
    const side = face === 0 ? 1 : -1;
    for (let row = 0; row <= rows; row++) {
      const v = row / rows;
      const width =
        v < 0.43
          ? THREE.MathUtils.lerp(profile.shoulder, profile.waist, v / 0.43)
          : THREE.MathUtils.lerp(profile.waist, profile.hem, (v - 0.43) / 0.57);
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const across = u * 2 - 1;
        const neck =
          profile.neckline *
          Math.pow(Math.max(0, 1 - Math.abs(across) / 0.44), 0.55);
        const x = across * width;
        const hem = 0.012 * Math.cos(across * 9) * v * v;
        const y = -neck * (1 - v) - profile.length * v + hem;
        const bow = 0.055 * Math.cos((across * Math.PI) / 2);
        const fold =
          profile.fold * Math.sin(across * 19 + v * 2.3) * (0.15 + 0.85 * v);
        const wrinkle =
          0.008 * Math.sin(v * 31 + across * 8) * Math.sin(Math.PI * v);
        positions.push(x, y, side * (0.027 + bow) + fold + wrinkle);
        uv.push(u, 1 - v);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = face * faceSize + row * stride + column;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        if (face === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  // Joining both faces gives hems and necklines visible thickness when rotated.
  const join = (a: number, b: number) =>
    indices.push(a, b, a + faceSize, b, b + faceSize, a + faceSize);
  for (let column = 0; column < columns; column++) {
    join(column + 1, column);
    join(rows * stride + column, rows * stride + column + 1);
  }
  for (let row = 0; row < rows; row++) {
    join(row * stride, (row + 1) * stride);
    join((row + 1) * stride + columns, row * stride + columns);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Open cuffs, tapered sleeves, and a gently bent elbow rather than solid cylinders. */
export function createSleeveGeometry(
  side: -1 | 1,
  long: boolean,
): THREE.BufferGeometry {
  const points = long
    ? [
        [0.43, -0.18, 0],
        [0.62, -0.52, 0.015],
        [0.65, -1.04, 0.035],
        [0.66, -1.48, 0.02],
      ]
    : [
        [0.43, -0.16, 0],
        [0.62, -0.34, 0],
        [0.74, -0.57, 0.012],
      ];
  const path = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  const rings = 20;
  const segments = 24;
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let row = 0; row <= rings; row++) {
    const t = row / rings;
    const center = path.getPoint(t);
    const tangent = path.getTangent(t);
    const across = new THREE.Vector3().crossVectors(tangent, zAxis).normalize();
    const radius = THREE.MathUtils.lerp(0.205, long ? 0.108 : 0.17, t);
    for (let column = 0; column <= segments; column++) {
      const angle = (column / segments) * Math.PI * 2;
      const pleat = 1 + 0.028 * Math.sin(angle * 5 + t * 11);
      const vertex = center
        .clone()
        .addScaledVector(across, Math.cos(angle) * radius * pleat)
        .addScaledVector(zAxis, Math.sin(angle) * radius * 0.64 * pleat);
      positions.push(vertex.x * side, vertex.y, vertex.z);
      uv.push(column / segments, t);
      if (row < rings && column < segments) {
        const a = row * (segments + 1) + column;
        const b = a + segments + 1;
        if (side === 1) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

export function clampRackRotation(
  value: number,
  mode: RackSceneMode = "rack",
): number {
  const limit = mode === "focus" ? 180 : 70;
  return Number.isFinite(value)
    ? THREE.MathUtils.clamp(value, -limit, limit)
    : mode === "focus"
      ? 0
      : -16;
}

export function clampRackZoom(value: number): number {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0.8, 1.4) : 1;
}

export function sceneGarments<T extends { id: string }>(
  items: readonly T[],
  selectedId: string | null,
  mode: RackSceneMode = "rack",
): T[] {
  return mode === "focus"
    ? items.filter((item) => item.id === selectedId)
    : [...items];
}

/** Conservative framing includes every yaw angle, so the back never clips on phones. */
export function focusCameraFrame(bounds: THREE.Box3, aspect: number, tilt = 0) {
  const finite =
    !bounds.isEmpty() &&
    [
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
    ].every(Number.isFinite);
  const center = finite
    ? bounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();
  const size = finite
    ? bounds.getSize(new THREE.Vector3())
    : new THREE.Vector3(1, 2, 0.5);
  const safeAspect =
    Number.isFinite(aspect) && aspect > 0 ? Math.max(0.05, aspect) : 1;
  const safeTilt = Number.isFinite(tilt)
    ? THREE.MathUtils.clamp(tilt, -Math.PI / 3, Math.PI / 3)
    : 0;
  const radius = Math.hypot(size.x, size.z) / 2;
  const halfHeight =
    Math.max(
      0.18,
      (size.y / 2) * Math.cos(safeTilt) + radius * Math.abs(Math.sin(safeTilt)),
      radius / safeAspect,
    ) * 1.17;
  return { center, halfHeight };
}

export function rackLayout(items: { id: string; type: string }[]) {
  const hanging = items.filter((item) => garmentKind(item.type) !== "shoes");
  const shelf = items.filter((item) => garmentKind(item.type) === "shoes");
  const width = Math.max(4.7, Math.min(9.5, hanging.length * 0.92 + 1.9));
  const spacing =
    hanging.length > 1
      ? Math.min(1.03, (width - 1.8) / (hanging.length - 1))
      : 0;
  return {
    width,
    hanging: hanging.map((item, index) => ({
      id: item.id,
      x: (index - (hanging.length - 1) / 2) * spacing,
    })),
    shelf: shelf.map((item, index) => ({
      id: item.id,
      x:
        (index - (shelf.length - 1) / 2) *
        Math.min(1.05, (width - 1.6) / Math.max(1, shelf.length)),
    })),
  };
}
