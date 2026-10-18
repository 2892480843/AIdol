import * as THREE from "three";
import {
  clothProfile,
  createClothGeometry,
  createSleeveGeometry,
  garmentKind,
  type GarmentKind,
} from "./scene-geometry";
import type { RackGarment } from "./scene-types";

function material(color: THREE.ColorRepresentation, roughness = 0.83) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    side: THREE.DoubleSide,
  });
}

function mesh(
  geometry: THREE.BufferGeometry,
  surface: THREE.Material,
  position?: [number, number, number],
) {
  const result = new THREE.Mesh(geometry, surface);
  if (position) result.position.set(...position);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function rod(
  start: [number, number, number],
  end: [number, number, number],
  radius: number,
  surface: THREE.Material,
) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const delta = b.clone().sub(a);
  const result = mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), 14),
    surface,
  );
  result.position.copy(a.add(b).multiplyScalar(0.5));
  result.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return result;
}

function seam(
  points: THREE.Vector3[],
  surface: THREE.Material,
  radius = 0.008,
) {
  return mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      Math.max(12, points.length * 3),
      radius,
      5,
      false,
    ),
    surface,
  );
}

function woodHanger() {
  const group = new THREE.Group();
  const wood = material("#b9895a", 0.58);
  const chrome = new THREE.MeshStandardMaterial({
    color: "#bfc2be",
    metalness: 0.93,
    roughness: 0.21,
  });
  group.add(
    rod([-0.51, -0.085, 0], [0, 0.16, 0], 0.034, wood),
    rod([0, 0.16, 0], [0.51, -0.085, 0], 0.034, wood),
    rod([-0.51, -0.085, 0], [0.51, -0.085, 0], 0.022, wood),
    rod([0, 0.16, 0], [0, 0.35, 0], 0.012, chrome),
  );
  const hook: THREE.Vector3[] = [];
  for (let i = 0; i <= 15; i++) {
    const angle = THREE.MathUtils.lerp(-Math.PI / 2, Math.PI * 1.07, i / 15);
    hook.push(
      new THREE.Vector3(
        0.065 + Math.cos(angle) * 0.065,
        0.414 + Math.sin(angle) * 0.065,
        0,
      ),
    );
  }
  group.add(seam(hook, chrome, 0.011));
  return group;
}

function addNeckline(
  group: THREE.Group,
  kind: GarmentKind,
  surface: THREE.Material,
) {
  const profile = clothProfile(kind);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 18; i++) {
    const across = THREE.MathUtils.lerp(-0.44, 0.44, i / 18);
    points.push(
      new THREE.Vector3(
        across * profile.shoulder,
        -profile.neckline *
          Math.pow(Math.max(0, 1 - Math.abs(across) / 0.44), 0.55) -
          0.006,
        0.027 + 0.055 * Math.cos((across * Math.PI) / 2) + 0.007,
      ),
    );
  }
  group.add(seam(points, surface, kind === "knit" ? 0.023 : 0.015));
}

function addHem(
  group: THREE.Group,
  kind: GarmentKind,
  surface: THREE.Material,
) {
  const profile = clothProfile(kind);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const across = i / 12 - 1;
    points.push(
      new THREE.Vector3(
        across * profile.hem,
        -profile.length + 0.012 * Math.cos(across * 9) + 0.025,
        0.03 +
          0.055 * Math.cos((across * Math.PI) / 2) +
          profile.fold * Math.sin(across * 19 + 2.3),
      ),
    );
  }
  group.add(seam(points, surface, 0.009));
}

function lapel(side: -1 | 1, surface: THREE.Material) {
  const shape = new THREE.Shape();
  shape.moveTo(side * 0.12, -0.13);
  shape.lineTo(side * 0.35, -0.025);
  shape.lineTo(side * 0.29, -0.5);
  shape.lineTo(side * 0.17, -0.37);
  shape.lineTo(0.01 * side, -0.74);
  shape.closePath();
  const result = mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSize: 0.008,
      bevelThickness: 0.006,
      bevelSegments: 2,
    }),
    surface,
  );
  result.position.z = 0.102;
  return result;
}

function pants(color: THREE.Color) {
  const group = new THREE.Group();
  const cloth = material(color);
  const stitch = material(color.clone().multiplyScalar(0.73));
  for (const side of [-1, 1] as const) {
    const leg = mesh(
      createClothGeometry({
        shoulder: 0.19,
        waist: 0.185,
        hem: 0.16,
        length: 1.95,
        neckline: 0,
        fold: 0.02,
      }),
      cloth,
    );
    leg.position.set(side * 0.19, -0.02, 0);
    leg.rotation.z = side * -0.018;
    group.add(leg);
    group.add(
      seam(
        [
          new THREE.Vector3(side * 0.365, -0.07, 0.05),
          new THREE.Vector3(side * 0.37, -0.8, 0.05),
          new THREE.Vector3(side * 0.335, -1.92, 0.06),
        ],
        stitch,
        0.006,
      ),
    );
    group.add(
      seam(
        [
          new THREE.Vector3(side * 0.06, -0.11, 0.1),
          new THREE.Vector3(side * 0.16, -0.27, 0.105),
          new THREE.Vector3(side * 0.28, -0.3, 0.095),
        ],
        stitch,
        0.006,
      ),
    );
  }
  const waistband = mesh(
    new THREE.BoxGeometry(0.77, 0.095, 0.15),
    cloth,
    [0, -0.02, 0],
  );
  group.add(waistband);
  const metal = new THREE.MeshStandardMaterial({
    color: "#bdb9aa",
    metalness: 0.65,
    roughness: 0.3,
  });
  for (const side of [-1, 1])
    group.add(
      mesh(new THREE.BoxGeometry(0.055, 0.1, 0.075), metal, [
        side * 0.3,
        0.015,
        0.03,
      ]),
    );
  return group;
}

function sneakers(color: THREE.Color) {
  const group = new THREE.Group();
  const upper = material(color, 0.7);
  const sole = material("#ede8dc", 0.66);
  const trim = material(
    color.clone().lerp(new THREE.Color("#41463f"), 0.28),
    0.7,
  );
  const lace = material("#ede8dc");
  for (const side of [-1, 1]) {
    const shoe = new THREE.Group();
    shoe.position.x = side * 0.195;
    shoe.rotation.y = side * 0.13;
    const soleMesh = mesh(
      new THREE.CapsuleGeometry(0.15, 0.47, 5, 18),
      sole,
      [0, 0.048, 0],
    );
    soleMesh.rotation.x = Math.PI / 2;
    soleMesh.scale.z = 0.25;
    // Scale in world Y after the capsule's longitudinal axis is rotated to Z.
    const soleGroup = new THREE.Group();
    soleMesh.scale.set(1, 1, 0.25);
    soleGroup.add(soleMesh);
    shoe.add(soleGroup);
    const body = mesh(
      new THREE.SphereGeometry(1, 24, 16),
      upper,
      [0, 0.17, 0.015],
    );
    body.scale.set(0.143, 0.12, 0.36);
    shoe.add(body);
    const collar = mesh(
      new THREE.TorusGeometry(0.079, 0.024, 8, 18),
      trim,
      [0, 0.265, -0.14],
    );
    collar.rotation.x = -Math.PI / 2;
    collar.scale.y = 1.28;
    shoe.add(collar);
    for (let i = 0; i < 4; i++) {
      shoe.add(
        rod(
          [-0.075, 0.272 - i * 0.012, -0.05 + i * 0.055],
          [0.075, 0.272 - i * 0.012, -0.05 + i * 0.055],
          0.007,
          lace,
        ),
      );
    }
    group.add(shoe);
  }
  group.rotation.y = -0.25;
  return group;
}

function accessory(color: THREE.Color, bag: boolean) {
  const group = new THREE.Group();
  const cloth = material(color, 0.72);
  if (bag) {
    const body = mesh(
      new THREE.BoxGeometry(0.64, 0.65, 0.22, 8, 8, 2),
      cloth,
      [0, -0.66, 0],
    );
    const positions = body.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      positions.setX(i, positions.getX(i) * (1 + y * 0.12));
    }
    body.geometry.computeVertexNormals();
    const handle = mesh(
      new THREE.TorusGeometry(0.2, 0.022, 8, 24, Math.PI),
      cloth,
      [0, -0.35, 0],
    );
    group.add(body, handle);
  } else {
    const scarf = mesh(
      createClothGeometry({
        shoulder: 0.2,
        waist: 0.19,
        hem: 0.22,
        length: 1.78,
        neckline: 0,
        fold: 0.032,
      }),
      cloth,
    );
    scarf.rotation.z = -0.08;
    scarf.position.set(0.05, -0.1, 0.03);
    group.add(scarf);
  }
  return group;
}

export function garmentColor(value: string): THREE.Color {
  // Color strings originate in the wardrobe API. Unknown names use a neutral fabric.
  const named: Record<string, string> = {
    beige: "#c8b99e",
    cream: "#e6ddc7",
    ivory: "#e9e4d8",
    white: "#eeeae0",
    black: "#303532",
    gray: "#92968d",
    grey: "#92968d",
    navy: "#35434d",
    blue: "#728da3",
    green: "#718471",
    olive: "#7c8160",
    pink: "#bd8f8a",
    red: "#99544e",
    brown: "#997c63",
    yellow: "#d8c688",
    purple: "#99879d",
    orange: "#b98456",
    burgundy: "#804d50",
    multicolor: "#9b9988",
  };
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized))
    return new THREE.Color(normalized);
  return new THREE.Color(named[normalized] ?? "#b9b3a4");
}

export function createGarment(item: RackGarment) {
  const group = new THREE.Group();
  group.name = item.id;
  group.userData.garmentId = item.id;
  const kind = garmentKind(item.type);
  const color = garmentColor(item.color);
  if (kind === "shoes") {
    group.add(sneakers(color));
  } else {
    group.add(woodHanger());
    if (kind === "pants") group.add(pants(color));
    else if (kind === "bag" || kind === "accessory")
      group.add(accessory(color, kind === "bag"));
    else {
      const surface = material(color, kind === "coat" ? 0.76 : 0.9);
      const trim = material(
        color.clone().multiplyScalar(kind === "knit" ? 0.88 : 0.8),
      );
      group.add(mesh(createClothGeometry(clothProfile(kind)), surface));
      if (kind !== "skirt") {
        addNeckline(group, kind, trim);
        if (kind !== "dress") {
          group.add(mesh(createSleeveGeometry(-1, kind !== "tee"), surface));
          group.add(mesh(createSleeveGeometry(1, kind !== "tee"), surface));
        }
      }
      addHem(group, kind, trim);
      if (kind === "shirt" || kind === "coat") {
        group.add(lapel(-1, trim), lapel(1, trim));
        const profile = clothProfile(kind);
        group.add(
          rod(
            [0.015, -0.69, 0.094],
            [0.015, -profile.length + 0.03, 0.094],
            0.009,
            trim,
          ),
        );
        const button = material(color.clone().multiplyScalar(0.43), 0.5);
        for (let i = 0; i < (kind === "coat" ? 4 : 5); i++) {
          const dot = mesh(
            new THREE.SphereGeometry(kind === "coat" ? 0.025 : 0.016, 8, 6),
            button,
            [kind === "coat" ? 0.075 : 0.015, -0.79 - i * 0.23, 0.112],
          );
          dot.scale.z = 0.35;
          group.add(dot);
        }
        if (kind === "coat") {
          for (const side of [-1, 1])
            group.add(
              rod(
                [side * 0.26, -1.12, 0.105],
                [side * 0.4, -1.05, 0.08],
                0.014,
                trim,
              ),
            );
        }
      }
    }
  }
  group.traverse((object) => {
    object.userData.garmentId = item.id;
  });
  return group;
}

export function createRack(width: number) {
  const group = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({
    color: "#c0c5bf",
    metalness: 0.93,
    roughness: 0.22,
  });
  const foot = material("#6c746c", 0.58);
  const wood = material("#bca888", 0.67);
  const half = width / 2;
  group.add(rod([-half, 3.79, 0], [half, 3.79, 0], 0.039, chrome));
  for (const side of [-1, 1]) {
    const x = side * half;
    group.add(
      rod([x, 0.12, 0], [x, 3.79, 0], 0.033, chrome),
      rod([x, 0.11, -0.65], [x, 0.11, 0.72], 0.038, chrome),
      mesh(new THREE.SphereGeometry(0.04, 12, 8), chrome, [x, 3.79, 0]),
    );
    for (const z of [-0.62, 0.69]) {
      group.add(
        mesh(new THREE.CylinderGeometry(0.063, 0.07, 0.065, 14), foot, [
          x,
          0.055,
          z,
        ]),
      );
    }
  }
  // An open lower shelf keeps shoes inside the wardrobe instead of hanging them.
  for (const z of [-0.3, 0, 0.3])
    group.add(rod([-half, 0.34, z], [half, 0.34, z], 0.022, chrome));
  const shelf = mesh(
    new THREE.BoxGeometry(width - 0.22, 0.045, 0.83),
    wood,
    [0, 0.365, 0],
  );
  group.add(shelf);
  return group;
}

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const surfaces = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      if (Array.isArray(object.material))
        object.material.forEach((value) => surfaces.add(value));
      else surfaces.add(object.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  surfaces.forEach((surface) => surface.dispose());
  root.clear();
}
