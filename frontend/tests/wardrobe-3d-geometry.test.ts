import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  clampRackRotation,
  clampRackZoom,
  clothProfile,
  createClothGeometry,
  createSleeveGeometry,
  focusCameraFrame,
  garmentKind,
  rackLayout,
  sceneGarments,
} from "@/components/wardrobe-3d/scene-geometry";
import {
  createGarment,
  createRack,
  disposeObject,
  garmentColor,
} from "@/components/wardrobe-3d/scene-model";

describe("procedural wardrobe geometry", () => {
  it.each([
    ["t-shirt", "tee"],
    ["T_SHIRT", "tee"],
    ["blouse", "shirt"],
    ["trench-coat", "coat"],
    ["dress", "dress"],
    ["sweater", "knit"],
    ["jeans", "pants"],
    ["sneakers", "shoes"],
    ["skirt", "skirt"],
    ["handbag", "bag"],
    ["scarf", "accessory"],
    ["unknown-new-category", "tee"],
  ])("maps %s to its physical silhouette %s", (input, expected) => {
    expect(garmentKind(input)).toBe(expected);
  });

  it("creates thick, folded fabric with finite indexed triangles and a lower neckline", () => {
    const geometry = createClothGeometry(clothProfile("tee"));
    const position = geometry.getAttribute("position");
    const faceSize = position.count / 2;
    expect(position.count).toBeGreaterThan(1500);
    expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
    expect(
      geometry.getIndex()?.array.every((index) => index < position.count),
    ).toBe(true);
    // The center of the first row is a real neckline opening in the mesh contour.
    expect(position.getY(14)).toBeLessThan(position.getY(0) - 0.15);
    // Front and back are distinct connected surfaces, not a textured plane.
    expect(position.getZ(14) - position.getZ(14 + faceSize)).toBeGreaterThan(
      0.1,
    );
    expect(
      new Set(Array.from(position.array).filter((_, index) => index % 3 === 2))
        .size,
    ).toBeGreaterThan(100);
    expect(geometry.boundingBox?.min.y).toBeLessThan(-1.45);
    geometry.dispose();
  });

  it("makes the dress flared and longer than the tee rather than recoloring one mesh", () => {
    const tee = createClothGeometry(clothProfile("tee"));
    const dress = createClothGeometry(clothProfile("dress"));
    expect(dress.boundingBox!.max.x - dress.boundingBox!.min.x).toBeGreaterThan(
      tee.boundingBox!.max.x - tee.boundingBox!.min.x,
    );
    expect(dress.boundingBox!.min.y).toBeLessThan(tee.boundingBox!.min.y - 0.6);
    tee.dispose();
    dress.dispose();
  });

  it("mirrors sleeves and gives long sleeves a lower cuff", () => {
    const left = createSleeveGeometry(-1, true);
    const right = createSleeveGeometry(1, true);
    const short = createSleeveGeometry(1, false);
    expect(left.boundingBox!.min.x).toBeCloseTo(-right.boundingBox!.max.x, 3);
    expect(right.boundingBox!.min.y).toBeLessThan(
      short.boundingBox!.min.y - 0.7,
    );
    for (const geometry of [left, right, short]) {
      expect(
        Array.from(geometry.getAttribute("position").array).every(
          Number.isFinite,
        ),
      ).toBe(true);
      geometry.dispose();
    }
  });

  it("puts shoes on the shelf and keeps hanging items inside the rail", () => {
    const inputs = [
      { id: "top", type: "t-shirt" },
      { id: "coat", type: "coat" },
      { id: "dress", type: "dress" },
      { id: "pants", type: "pants" },
      { id: "shoes", type: "sneakers" },
    ];
    const before = JSON.stringify(inputs);
    const layout = rackLayout(inputs);
    expect(layout.hanging).toHaveLength(4);
    expect(layout.shelf).toEqual([{ id: "shoes", x: 0 }]);
    expect(
      layout.hanging.every((slot) => Math.abs(slot.x) < layout.width / 2 - 0.6),
    ).toBe(true);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(rackLayout([])).toMatchObject({ hanging: [], shelf: [] });
    expect(rackLayout([{ id: "one", type: "tee" }]).hanging).toEqual([
      { id: "one", x: 0 },
    ]);
  });

  it("clamps corrupted view settings to finite safe ranges", () => {
    expect(clampRackRotation(Infinity)).toBe(-16);
    expect(clampRackRotation(-100)).toBe(-70);
    expect(clampRackRotation(100)).toBe(70);
    expect(clampRackZoom(NaN)).toBe(1);
    expect(clampRackZoom(0)).toBe(0.8);
    expect(clampRackZoom(10)).toBe(1.4);
  });

  it("uses valid hex colors and a safe neutral when the API color is unknown", () => {
    expect(garmentColor("#123456").getHexString()).toBe("123456");
    expect(garmentColor("navy").getHexString()).toBe("35434d");
    expect(garmentColor("unmapped-color").getHexString()).toBe("b9b3a4");
  });

  it("constructs every category without textures and assigns picking identifiers to all mesh children", () => {
    const root = new THREE.Group();
    for (const type of [
      "t-shirt",
      "coat",
      "dress",
      "pants",
      "sneakers",
      "shirt",
      "sweater",
      "skirt",
      "bag",
      "scarf",
    ]) {
      const group = createGarment({
        id: type,
        name: type,
        type,
        color: "olive",
      });
      const bounds = new THREE.Box3().setFromObject(group);
      expect(bounds.isEmpty()).toBe(false);
      expect(
        [
          bounds.min.x,
          bounds.min.y,
          bounds.min.z,
          bounds.max.x,
          bounds.max.y,
          bounds.max.z,
        ].every(Number.isFinite),
      ).toBe(true);
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        expect(object.userData.garmentId).toBe(type);
        expect(
          Array.from(object.geometry.getAttribute("position").array).every(
            Number.isFinite,
          ),
        ).toBe(true);
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const surface of materials)
          expect((surface as THREE.MeshStandardMaterial).map).toBeNull();
      });
      root.add(group);
    }
    root.add(createRack(5.5));
    let disposed = 0;
    root.traverse((object) => {
      if (object instanceof THREE.Mesh)
        object.geometry.addEventListener("dispose", () => {
          disposed++;
        });
    });
    disposeObject(root);
    expect(disposed).toBeGreaterThan(50);
    expect(root.children).toHaveLength(0);
  });
});

describe("single garment focus", () => {
  const items = [
    { id: "top", type: "t-shirt", color: "white", name: "Tee" },
    { id: "dress", type: "dress", color: "navy", name: "Dress" },
    { id: "shoes", type: "sneakers", color: "beige", name: "Sneakers" },
  ];

  it("shows only the selected item in focus and leaves the rack collection intact", () => {
    const before = JSON.stringify(items);
    expect(sceneGarments(items, "dress", "focus")).toEqual([items[1]]);
    expect(sceneGarments(items, "missing", "focus")).toEqual([]);
    expect(sceneGarments(items, null, "focus")).toEqual([]);
    expect(sceneGarments(items, "top", "rack")).toEqual(items);
    expect(sceneGarments(items, "top")).toEqual(items);
    expect(JSON.stringify(items)).toBe(before);
  });

  it("allows a complete turn only in focus mode and handles invalid rotations", () => {
    expect(clampRackRotation(160, "focus")).toBe(160);
    expect(clampRackRotation(200, "focus")).toBe(180);
    expect(clampRackRotation(-200, "focus")).toBe(-180);
    expect(clampRackRotation(NaN, "focus")).toBe(0);
    expect(clampRackRotation(160, "rack")).toBe(70);
    expect(clampRackRotation(-160)).toBe(-70);
  });

  it.each(["t-shirt", "dress", "pants", "sneakers"])(
    "centers %s and fits its complete turn into a narrow phone or wide canvas",
    (type) => {
      const group = createGarment({
        id: type,
        type,
        color: "olive",
        name: type,
      });
      const bounds = new THREE.Box3().setFromObject(group);
      const tilt = type === "sneakers" ? 0.42 : 0.025;
      for (const aspect of [276 / 400, 320 / 500, 1.8]) {
        const frame = focusCameraFrame(bounds, aspect, tilt);
        expect(
          frame.center.distanceTo(bounds.getCenter(new THREE.Vector3())),
        ).toBeLessThan(0.00001);
        expect(Number.isFinite(frame.halfHeight)).toBe(true);
        const camera = new THREE.OrthographicCamera(
          -frame.halfHeight * aspect,
          frame.halfHeight * aspect,
          frame.halfHeight,
          -frame.halfHeight,
          0.1,
          50,
        );
        camera.position.set(0, Math.sin(tilt) * 10, Math.cos(tilt) * 10);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
        for (const yaw of [-180, -90, 0, 90, 180]) {
          const rotation = new THREE.Matrix4().makeRotationY(
            (yaw * Math.PI) / 180,
          );
          for (const x of [bounds.min.x, bounds.max.x]) {
            for (const y of [bounds.min.y, bounds.max.y]) {
              for (const z of [bounds.min.z, bounds.max.z]) {
                const projected = new THREE.Vector3(x, y, z)
                  .sub(frame.center)
                  .applyMatrix4(rotation)
                  .project(camera);
                expect(Math.abs(projected.x)).toBeLessThan(0.98);
                expect(Math.abs(projected.y)).toBeLessThan(0.98);
              }
            }
          }
        }
      }
      disposeObject(group);
    },
  );

  it("uses the shoe's own bounds and returns a safe finite frame for empty or invalid inputs", () => {
    const shoe = createGarment(items[2]);
    const dress = createGarment(items[1]);
    expect(
      focusCameraFrame(new THREE.Box3().setFromObject(shoe), 1).halfHeight,
    ).toBeLessThan(
      focusCameraFrame(new THREE.Box3().setFromObject(dress), 1).halfHeight,
    );
    const frame = focusCameraFrame(new THREE.Box3(), NaN);
    expect(
      [frame.center.x, frame.center.y, frame.center.z, frame.halfHeight].every(
        Number.isFinite,
      ),
    ).toBe(true);
    expect(frame.halfHeight).toBeGreaterThan(0);
    disposeObject(shoe);
    disposeObject(dress);
  });
});
