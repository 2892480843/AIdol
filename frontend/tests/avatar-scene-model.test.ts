import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { act, render, waitFor } from "@testing-library/react";
import * as THREE from "three";
import AvatarScene from "@/components/avatar-studio/scene";
import type { AvatarSceneProps } from "@/components/avatar-studio/scene-types";
import { DEFAULT_AVATAR_CONFIG } from "@/lib/avatar-studio";
import {
  avatarLayer,
  applyAvatarWardrobe,
  applyAvatarPose,
  disposeAvatarObject,
  normalizeAvatarModel,
  normalizedAvatarRotation,
  safeAvatarZoom,
} from "@/components/avatar-studio/scene-model";

const graphics = vi.hoisted(() => ({
  parse: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  loseContext: vi.fn(),
  record: vi.fn(),
}));
// Mock only GPU/asset IO boundaries. Scene objects, transforms, materials and disposal are real Three.js.
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      shadowMap = { enabled: false, type: 0 };
      capabilities = { maxTextureSize: 8192 };
      setPixelRatio() { }
      setSize() { }
      render = graphics.render;
      dispose = graphics.dispose;
      forceContextLoss = graphics.loseContext;
    },
    PMREMGenerator: class {
      fromScene() {
        return new actual.WebGLRenderTarget(16, 16);
      }
      dispose() { }
    },
  };
});
vi.mock("three/addons/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    parseAsync = graphics.parse;
  },
}));

vi.mock("@/lib/avatar-turntable", () => ({recordAvatarTurntable: (...args: unknown[]) => graphics.record(...args)}));

const palette = {
  tops: "#f5f3ef",
  bottoms: "#19314d",
  dresses: "#8b2342",
  outerwear: "#5a6e42",
  shoes: "#222222",
};
function garment(layer: string) {
  const result = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial(),
  );
  result.name = `garment_${layer}`;
  result.userData.avatarLayer = layer;
  return result;
}

describe("avatar layered model", () => {
  it("uses explicit asset metadata before ambiguous names and leaves unknown body details alone", () => {
    const mesh = garment("body");
    mesh.name = "tops_body";
    expect(avatarLayer(mesh)).toBe("body");
    const named = new THREE.Object3D();
    named.name = "garment_outerwear.001";
    expect(avatarLayer(named)).toBe("outerwear");
    named.name = "eyelashes";
    expect(avatarLayer(named)).toBe("other");
  });
  it("shows a complete dress or separates, keeps the body visible, and recolors only garment layers", () => {
    const model = new THREE.Group();
    const body = garment("body");
    const tops = garment("tops");
    const bottoms = garment("bottoms");
    const dress = garment("dresses");
    const coat = garment("outerwear");
    const shoe = garment("shoes");
    model.add(body, tops, bottoms, dress, coat, shoe);
    const skin = body.material.color.getHexString();
    applyAvatarWardrobe(model, palette, true, false);
    expect([
      tops.visible,
      bottoms.visible,
      dress.visible,
      coat.visible,
      shoe.visible,
      body.visible,
    ]).toEqual([false, false, true, false, true, true]);
    expect(dress.material.color.getHexString()).toBe("8b2342");
    expect(body.material.color.getHexString()).toBe(skin);
    applyAvatarWardrobe(model, palette, false, true);
    expect([
      tops.visible,
      bottoms.visible,
      dress.visible,
      coat.visible,
    ]).toEqual([true, true, false, true]);
  });
  it("retains complete separates when an asset has no dress layer", () => {
    const model = new THREE.Group();
    const tops = garment("tops");
    const bottoms = garment("bottoms");
    model.add(tops, bottoms);
    applyAvatarWardrobe(model, palette, true, false);
    expect(tops.visible && bottoms.visible).toBe(true);
  });
  it("hides the independent top only while an authored closed blazer replaces it", () => {
    const model = new THREE.Group();
    const top = garment("tops");
    const pants = garment("bottoms");
    const coverage = garment("base");
    const coat = garment("outerwear");
    coat.userData.avatarReplacesTops = true;
    model.add(top, pants, coverage, coat);
    applyAvatarWardrobe(model, palette, false, true);
    expect([
      top.visible,
      pants.visible,
      coverage.visible,
      coat.visible,
    ]).toEqual([false, true, true, true]);
    applyAvatarWardrobe(model, palette, false, false);
    expect([
      top.visible,
      pants.visible,
      coverage.visible,
      coat.visible,
    ]).toEqual([true, true, true, false]);
    coat.userData.avatarReplacesTops = false;
    applyAvatarWardrobe(model, palette, false, true);
    expect(top.visible).toBe(true);
    top.userData.avatarReplacesTops = true;
    applyAvatarWardrobe(model, palette, false, true);
    expect(top.visible).toBe(true);
  });
  it("inherits authored layers from a GLTF multi-primitive group and preserves protected trim materials", () => {
    const root = new THREE.Group();
    const tops = garment("tops");
    const coat = new THREE.Group();
    coat.name = "Outerwear";
    coat.userData.avatarLayer = "outerwear";
    coat.userData.avatarReplacesTops = true;
    const fabric = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#888888" }),
    );
    fabric.name = "suit3";
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#ffffff" }),
    );
    trim.name = "suit3_1";
    trim.material.userData.avatarRecolor = false;
    coat.add(fabric, trim);
    root.add(tops, coat);
    expect(avatarLayer(fabric)).toBe("outerwear");
    applyAvatarWardrobe(root, palette, false, true);
    expect(fabric.material.color.getHexString()).toBe(
      palette.outerwear.slice(1),
    );
    expect(trim.material.color.getHexString()).toBe("ffffff");
    expect([coat.visible, fabric.visible, trim.visible, tops.visible]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    applyAvatarWardrobe(root, palette, false, false);
    expect([coat.visible, fabric.visible, trim.visible, tops.visible]).toEqual([
      false,
      false,
      false,
      true,
    ]);
    const protectedBody = garment("body");
    coat.add(protectedBody);
    expect(avatarLayer(protectedBody)).toBe("body");
    const emptyCoat = new THREE.Group();
    emptyCoat.userData.avatarLayer = "outerwear";
    emptyCoat.userData.avatarReplacesTops = true;
    root.remove(coat);
    root.add(emptyCoat);
    applyAvatarWardrobe(root, palette, false, true);
    expect(tops.visible).toBe(true);
  });
  it("clips invisible hair and eyelash pixels from shadow maps without disabling shadows or changing opaque trim", () => {
    const root = new THREE.Group();
    const hair = garment("hair");
    const lashes = garment("base");
    for (const mesh of [hair, lashes]) {
      mesh.material.transparent = true;
      mesh.material.map = new THREE.Texture();
      mesh.material.userData.avatarRecolor = false;
      mesh.material.color.set("#271c17");
      expect(mesh.material.alphaTest).toBe(0);
    }
    const coat = garment("outerwear");
    coat.material.userData.avatarRecolor = false;
    coat.material.color.set("#ffffff");
    const authored = garment("hair");
    authored.material.transparent = true;
    authored.material.map = new THREE.Texture();
    authored.material.alphaTest = 0.4;
    root.add(hair, lashes, coat, authored);
    applyAvatarWardrobe(root, palette, false, true);
    expect(hair.material.alphaTest).toBe(0.25);
    expect(lashes.material.alphaTest).toBe(0.25);
    expect(authored.material.alphaTest).toBe(0.4);
    expect(coat.material.alphaTest).toBe(0);
    expect(coat.material.color.getHexString()).toBe("ffffff");
    expect(hair.material.color.getHexString()).toBe("271c17");
    expect(hair.castShadow && lashes.castShadow && coat.castShadow).toBe(true);
    const version = hair.material.version;
    applyAvatarWardrobe(root, palette, false, true);
    expect(hair.material.version).toBe(version);
  });
  it("hides only skin materials explicitly covered by outerwear and restores them when outerwear is removed", () => {
    const covered = new THREE.MeshStandardMaterial({ color: "#c49a7c" });
    covered.userData.avatarHiddenByOuterwear = true;
    covered.userData.avatarRecolor = false;
    const exposed = new THREE.MeshStandardMaterial({ color: "#c49a7c" });
    exposed.userData.avatarRecolor = false;
    const body = new THREE.Mesh(new THREE.BoxGeometry(), [covered, exposed]);
    body.userData.avatarLayer = "body";
    const root = new THREE.Group();
    root.add(body, garment("outerwear"));
    applyAvatarWardrobe(root, palette, false, false);
    expect(covered.visible && exposed.visible && body.visible).toBe(true);
    applyAvatarWardrobe(root, palette, false, true);
    expect(covered.visible).toBe(false);
    expect(exposed.visible && body.visible).toBe(true);
    expect(covered.color.getHexString()).toBe("c49a7c");
    expect(exposed.color.getHexString()).toBe("c49a7c");
    applyAvatarWardrobe(root, palette, false, false);
    expect(covered.visible && exposed.visible && body.visible).toBe(true);
  });
  it("applies only the authored outerwear fit morph, including GLTF groups, and restores the original silhouette", () => {
    const root = new THREE.Group();
    const pantsNode = new THREE.Group();
    pantsNode.userData.avatarLayer = "bottoms";
    pantsNode.userData.avatarOuterwearFitMorph = "OuterwearLayerFit";
    const pants = garment("bottoms");
    pants.morphTargetDictionary = { OuterwearLayerFit: 0, OtherFit: 1 };
    pants.morphTargetInfluences = [0, 0.37];
    pantsNode.add(pants);
    root.add(pantsNode);
    applyAvatarWardrobe(root, palette, false, true);
    expect(pants.morphTargetInfluences).toEqual([1, 0.37]);
    applyAvatarWardrobe(root, palette, false, false);
    expect(pants.morphTargetInfluences).toEqual([0, 0.37]);
    applyAvatarWardrobe(root, palette, false, true);
    expect(pants.morphTargetInfluences).toEqual([1, 0.37]);
    pants.userData.avatarOuterwearFitMorph = "MissingTarget";
    applyAvatarWardrobe(root, palette, false, false);
    expect(pants.morphTargetInfluences).toEqual([1, 0.37]);
    pants.morphTargetInfluences = undefined;
    expect(() => applyAvatarWardrobe(root, palette, false, true)).not.toThrow();
    pants.morphTargetDictionary = undefined;
    expect(() =>
      applyAvatarWardrobe(root, palette, false, false),
    ).not.toThrow();
  });
  it("normalizes an arbitrarily scaled and offset asset to the floor without changing proportions", () => {
    const model = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 8, 1),
      new THREE.MeshStandardMaterial(),
    );
    body.position.set(3, 9, -2);
    model.add(body);
    const normalized = normalizeAvatarModel(model);
    const bounds = new THREE.Box3().setFromObject(normalized);
    const dimensions = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
    expect(dimensions.y).toBeCloseTo(3.2);
    expect(dimensions.x / dimensions.y).toBeCloseTo(0.25);
  });
  it("poses known skeleton bones from their rest transforms so updates do not accumulate", () => {
    const model = new THREE.Group();
    const spine = new THREE.Bone();
    spine.name = "spine03";
    spine.rotation.y = 0.03;
    model.add(spine);
    applyAvatarPose(model, "editorial");
    const first = spine.quaternion.clone();
    applyAvatarPose(model, "editorial");
    expect(spine.quaternion.angleTo(first)).toBeCloseTo(0);
    applyAvatarPose(model, "relaxed");
    expect(spine.rotation.y).toBeCloseTo(0.03);
  });
  it.each(["female", "male"])(
    "lowers both real %s asset arms naturally in avatar space and never accumulates pose edits",
    (model) => {
      const file = readFileSync(
        `${process.cwd()}/public/models/avatar/${model}.glb`,
      );
      const length = file.readUInt32LE(12);
      const gltf = JSON.parse(
        file.subarray(20, 20 + length).toString("utf8"),
      ) as {
        nodes: {
          name?: string;
          children?: number[];
          translation?: number[];
          rotation?: number[];
          scale?: number[];
        }[];
        scenes: { nodes: number[]; }[];
      };
      const nodes = gltf.nodes.map((node) => {
        const bone = new THREE.Bone();
        bone.name = node.name ?? "";
        if (node.translation) bone.position.fromArray(node.translation);
        if (node.rotation) bone.quaternion.fromArray(node.rotation);
        if (node.scale) bone.scale.fromArray(node.scale);
        return bone;
      });
      gltf.nodes.forEach((node, index) =>
        node.children?.forEach((child) => nodes[index].add(nodes[child])),
      );
      const root = new THREE.Group();
      gltf.scenes[0].nodes.forEach((index) => root.add(nodes[index]));
      root.rotation.y = 1.1;
      root.scale.setScalar(1.8);
      const direction = (name: string, child: string) => {
        root.updateMatrixWorld(true);
        const start = root.worldToLocal(
          root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()),
        );
        const end = root.worldToLocal(
          root.getObjectByName(child)!.getWorldPosition(new THREE.Vector3()),
        );
        return end.sub(start).normalize();
      };
      applyAvatarPose(root, "relaxed");
      for (const side of ["l", "r"]) {
        expect(
          direction(`upperarm_${side}`, `lowerarm_${side}`).y,
        ).toBeLessThan(-0.96);
        expect(direction(`lowerarm_${side}`, `hand_${side}`).y).toBeLessThan(
          -0.96,
        );
      }
      const relaxed = nodes.map((node) => node.quaternion.clone());
      for (let i = 0; i < 6; i++) {
        applyAvatarPose(root, "editorial");
        for (const side of ["l", "r"])
          expect(
            direction(`upperarm_${side}`, `lowerarm_${side}`).y,
          ).toBeLessThan(-0.94);
        applyAvatarPose(root, "relaxed");
      }
      nodes.forEach((node, index) =>
        expect(
          node.quaternion
            .clone()
            .normalize()
            .angleTo(relaxed[index].clone().normalize()),
        ).toBeLessThan(0.000001),
      );
    },
  );
  it("bounds invalid rotation and zoom inputs", () => {
    expect(normalizedAvatarRotation(721)).toBe(1);
    expect(normalizedAvatarRotation(-90)).toBe(-90);
    expect(normalizedAvatarRotation(181)).toBe(-179);
    expect(normalizedAvatarRotation(180)).toBe(180);
    expect(normalizedAvatarRotation(NaN)).toBe(0);
    expect(safeAvatarZoom(999)).toBe(1.5);
    expect(safeAvatarZoom(0)).toBe(0.75);
    expect(safeAvatarZoom(NaN)).toBe(1);
  });
  it("disposes shared GPU objects and bitmap sources exactly once even on repeated cleanup", () => {
    const close = vi.fn();
    const textureA = new THREE.Texture({
      close,
    } as unknown as HTMLImageElement);
    const textureB = textureA.clone();
    const material = new THREE.MeshStandardMaterial({
      map: textureA,
      normalMap: textureB,
    });
    const geometry = new THREE.BoxGeometry();
    const model = new THREE.Group();
    model.add(
      new THREE.Mesh(geometry, material),
      new THREE.Mesh(geometry, material),
    );
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const disposeA = vi.spyOn(textureA, "dispose");
    const disposeB = vi.spyOn(textureB, "dispose");
    disposeAvatarObject(model);
    disposeAvatarObject(model);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(model.children).toHaveLength(0);
  });
});

describe("avatar scene asynchronous lifecycle", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const frame = () => {
    const pending = Array.from(frames.values());
    frames.clear();
    act(() => pending.forEach((callback) => callback(16 * nextFrame)));
  };
  const props = (
    overrides: Partial<AvatarSceneProps> = {},
  ): AvatarSceneProps => ({
    config: {
      ...DEFAULT_AVATAR_CONFIG,
      palette: { ...DEFAULT_AVATAR_CONFIG.palette },
    },
    dressMode: false,
    showOuterwear: false,
    autoRotate: false,
    reducedMotion: true,
    ariaLabel: "Adult avatar",
    onRotationChange: vi.fn(),
    onZoomChange: vi.fn(),
    onReady: vi.fn(),
    onError: vi.fn(),
    onController: vi.fn(),
    ...overrides,
  });
  beforeEach(() => {
    vi.clearAllMocks();
    frames = new Map();
    nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(16),
    } as Response);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["scrolled after loading", "initially offscreen"])("records an offscreen model: %s", async (mode) => {
    let intersect!: (visible: boolean) => void;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { intersect = visible => callback([{isIntersecting: visible} as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
      observe() {} disconnect() {}
    });
    try {
      const model = new THREE.Group(); model.add(garment("tops"));
      graphics.parse.mockResolvedValue({scene: model});
      graphics.record.mockImplementation(async (_canvas, draw) => {draw(0);draw(1);return new Blob(["video"], {type:"video/webm"});});
      const callbacks = props(); const rendered = render(React.createElement(AvatarScene, callbacks));
      await waitFor(() => expect(callbacks.onController).toHaveBeenCalledWith(expect.objectContaining({captureTurntable: expect.any(Function)})));
      if (mode === "initially offscreen") act(() => intersect(false));
      frame();
      if (mode === "scrolled after loading") act(() => intersect(false));
      const controller = vi.mocked(callbacks.onController).mock.calls.at(-1)![0]!;
      await expect(controller.captureTurntable!()).resolves.toHaveProperty("size",5);
      expect(graphics.record).toHaveBeenCalledTimes(1);
      rendered.unmount();
    } finally { vi.unstubAllGlobals(); }
  });

  it("loads the bundled editorial model without hiding or recoloring its complete outfit", async () => {
    const model = new THREE.Group();
    const mesh = garment("dresses");
    mesh.material.color.set("#a8b9c0");
    model.add(mesh);
    graphics.parse.mockResolvedValue({ scene: model });
    const callbacks = props({ config: { ...DEFAULT_AVATAR_CONFIG, renderMode: "editorial" } });
    const rendered = render(React.createElement(AvatarScene, callbacks));
    await waitFor(() => expect(callbacks.onController).toHaveBeenCalledWith(expect.objectContaining({ capture: expect.any(Function) })));
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/models\/avatar\/editorial-v1\/female(?:-mobile)?\.glb$/), expect.objectContaining({ credentials: "omit" }));
    frame();
    expect(mesh.visible).toBe(true);
    expect(mesh.material.color.getHexString()).toBe("a8b9c0");
    expect(mesh.castShadow).toBe(true);
    expect(callbacks.onError).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it("exports an opaque studio image and optional thumbnail failures do not report an export alert", async () => {
    const model = new THREE.Group();
    model.add(garment("tops"));
    graphics.parse.mockResolvedValue({ scene: model });
    const fillRect = vi.fn(),
      drawImage = vi.fn();
    const context = { fillStyle: "", fillRect, drawImage };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const blob = new Blob(["image"], { type: "image/png" });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(blob),
    );
    const callbacks = props();
    const rendered = render(React.createElement(AvatarScene, callbacks));
    await waitFor(() =>
      expect(callbacks.onController).toHaveBeenCalledWith(
        expect.objectContaining({ capture: expect.any(Function) }),
      ),
    );
    frame();
    const controller = vi
      .mocked(callbacks.onController)
      .mock.calls.find(([value]) => value)?.[0]!;
    expect(await controller.capture()).toBe(blob);
    expect(context.fillStyle).toBe("#eeebe8");
    expect(fillRect).toHaveBeenCalledWith(0, 0, 300, 150);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(fillRect.mock.invocationCallOrder[0]).toBeLessThan(
      drawImage.mock.invocationCallOrder[0],
    );
    rendered.unmount();
    await expect(controller.capture({ reportError: false })).rejects.toThrow();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("disposes a model that finishes decoding after unmount and never publishes its controller", async () => {
    let complete!: (gltf: { scene: THREE.Group; }) => void;
    graphics.parse.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const callbacks = props();
    const rendered = render(React.createElement(AvatarScene, callbacks));
    await waitFor(() => expect(graphics.parse).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    const late = new THREE.Group();
    const mesh = garment("tops");
    late.add(mesh);
    const dispose = vi.spyOn(mesh.geometry, "dispose");
    rendered.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      complete({ scene: late });
      await Promise.resolve();
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(callbacks.onController).not.toHaveBeenCalledWith(
      expect.objectContaining({ capture: expect.any(Function) }),
    );
    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(graphics.dispose).toHaveBeenCalledTimes(1);
    expect(graphics.loseContext).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it.each(["gender", "editorial outfit"] as const)("keeps the newest model when an earlier model finishes after a %s switch", async (kind) => {
    const completes: ((gltf: { scene: THREE.Group; }) => void)[] = [];
    graphics.parse.mockImplementation(
      () =>
        new Promise((resolve) => {
          completes.push(resolve);
        }),
    );
    const callbacks = props();
    if (kind === "editorial outfit") callbacks.config = { ...callbacks.config, renderMode: "editorial" };
    const rendered = render(React.createElement(AvatarScene, callbacks));
    await waitFor(() => expect(completes).toHaveLength(1));
    rendered.rerender(
      React.createElement(AvatarScene, {
        ...callbacks,
        config: kind === "gender" ? { ...callbacks.config, model: "male" } : { ...callbacks.config, editorialLook: "street" },
      }),
    );
    await waitFor(() => expect(completes).toHaveLength(2));
    const newest = new THREE.Group();
    newest.name = "newest_model";
    newest.add(garment("tops"));
    await act(async () => {
      completes[1]({ scene: newest });
      await Promise.resolve();
    });
    frame();
    const stale = new THREE.Group();
    stale.name = "stale_model";
    const oldMesh = garment("tops");
    stale.add(oldMesh);
    const dispose = vi.spyOn(oldMesh.geometry, "dispose");
    await act(async () => {
      completes[0]({ scene: stale });
      await Promise.resolve();
    });
    expect(dispose).toHaveBeenCalledTimes(1);
    const scene = graphics.render.mock.calls.at(-1)?.[0] as THREE.Scene;
    expect(scene.getObjectByName("newest_model")).toBe(newest);
    expect(scene.getObjectByName("stale_model")).toBeUndefined();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      kind === "gender" ? "/models/avatar/v2/male.glb" : "/models/avatar/editorial-v1/female-street.glb",
      expect.objectContaining({ credentials: "omit" }),
    );
    rendered.unmount();
  });

  it("stops after a requested frame when motion is reduced and cancels immediately on context loss", async () => {
    const model = new THREE.Group();
    model.add(garment("tops"));
    graphics.parse.mockResolvedValue({ scene: model });
    const callbacks = props({ autoRotate: true, reducedMotion: true });
    const rendered = render(React.createElement(AvatarScene, callbacks));
    await waitFor(() =>
      expect(callbacks.onController).toHaveBeenCalledWith(
        expect.objectContaining({ capture: expect.any(Function) }),
      ),
    );
    frame();
    expect(frames.size).toBe(0);
    expect(callbacks.onRotationChange).not.toHaveBeenCalled();
    rendered.rerender(
      React.createElement(AvatarScene, { ...callbacks, reducedMotion: false }),
    );
    frame();
    expect(frames.size).toBe(1);
    const canvas = rendered.container.querySelector("canvas")!;
    act(() =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
    expect(frames.size).toBe(0);
    expect(callbacks.onError).toHaveBeenCalledWith("webgl");
    expect(callbacks.onController).toHaveBeenLastCalledWith(null);
    rendered.unmount();
  });

  it("frames the face closer while keeping the same loaded three-dimensional model", async () => {
    const model = new THREE.Group();
    model.add(garment("tops"));
    graphics.parse.mockResolvedValue({ scene: model });
    const callbacks = props({ reducedMotion: true });
    const rendered = render(React.createElement(AvatarScene, callbacks));
    await waitFor(() => expect(callbacks.onController).toHaveBeenCalledWith(expect.objectContaining({ capture: expect.any(Function) })));
    frame();
    const camera = graphics.render.mock.calls.at(-1)?.[1] as THREE.PerspectiveCamera;
    const fullDistance = camera.position.z;
    rendered.rerender(React.createElement(AvatarScene, { ...callbacks, framing: "portrait" }));
    frame();
    expect(camera.position.y).toBeGreaterThan(2.6);
    expect(camera.position.z).toBeLessThan(fullDistance * 0.6);
    expect(graphics.parse).toHaveBeenCalledTimes(1);
    rendered.rerender(React.createElement(AvatarScene, callbacks));
    frame();
    expect(camera.position.z).toBeCloseTo(fullDistance);
    rendered.unmount();
  });

  it("does not report a replacement ready while only the previous model is still rendering", async () => {
    const original = new THREE.Group();
    original.add(garment("tops"));
    let complete!: (gltf: { scene: THREE.Group; }) => void;
    graphics.parse.mockResolvedValueOnce({ scene: original });
    graphics.parse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const callbacks = props();
    const rendered = render(React.createElement(AvatarScene, callbacks));
    await waitFor(() =>
      expect(callbacks.onController).toHaveBeenCalledWith(
        expect.objectContaining({ capture: expect.any(Function) }),
      ),
    );
    frame();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    rendered.rerender(
      React.createElement(AvatarScene, {
        ...callbacks,
        config: { ...callbacks.config, model: "male" },
      }),
    );
    await waitFor(() => expect(graphics.parse).toHaveBeenCalledTimes(2));
    frame();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    expect(callbacks.onController).toHaveBeenLastCalledWith(null);
    const replacement = new THREE.Group();
    replacement.add(garment("tops"));
    await act(async () => {
      complete({ scene: replacement });
      await Promise.resolve();
    });
    frame();
    expect(callbacks.onReady).toHaveBeenCalledTimes(2);
    rendered.unmount();
  });
});
