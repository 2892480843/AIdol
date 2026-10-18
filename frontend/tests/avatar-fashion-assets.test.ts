// @vitest-environment node
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FASHION_GARMENTS,
  FASHION_LOOKS,
  fashionThumbnail,
} from "@/lib/avatar-fashion";
import { AVATAR_PRESET_ORDER } from "@/lib/avatar-studio";

type Asset = {
  nodes: {
    mesh?: number;
    children?: number[];
    extras?: { avatarLayer?: string; avatarVariant?: string };
  }[];
  skins: { joints: number[] }[];
  buffers: { uri?: string }[];
  images: { uri?: string; bufferView?: number }[];
  meshes: {
    primitives: { attributes: Record<string, number>; indices: number }[];
  }[];
};
function readAsset(model: string): Asset {
  const file = join(process.cwd(), "public/models/avatar/v2", `${model}.glb`);
  expect(statSync(file).size).toBeLessThan(26_000_000);
  const fd = openSync(file, "r");
  try {
    const header = Buffer.alloc(20);
    readSync(fd, header, 0, 20, 0);
    expect(header.readUInt32LE(0)).toBe(0x46546c67);
    expect(header.readUInt32LE(4)).toBe(2);
    expect(header.readUInt32LE(8)).toBe(statSync(file).size);
    const json = Buffer.alloc(header.readUInt32LE(12));
    readSync(fd, json, 0, json.length, 20);
    return JSON.parse(json.toString());
  } finally {
    closeSync(fd);
  }
}
for (const model of ["female", "male"] as const) {
  describe(`published ${model} fashion asset`, () => {
    it("has real skinned geometry and self-contained textures", () => {
      const asset = readAsset(model);
      expect(asset.skins[0].joints.length).toBeGreaterThanOrEqual(50);
      expect(asset.images.length).toBeGreaterThanOrEqual(6);
      expect(
        asset.images.every(
          (image) => !image.uri && Number.isInteger(image.bufferView),
        ),
      ).toBe(true);
      expect(asset.buffers.every((buffer) => !buffer.uri)).toBe(true);
      expect(
        asset.meshes.every((mesh) =>
          mesh.primitives.every(
            (p) =>
              p.attributes.POSITION !== undefined &&
              p.attributes.JOINTS_0 !== undefined,
          ),
        ),
      ).toBe(true);
    });
    it("contains every advertised garment cut and complete recipe", () => {
      const asset = readAsset(model);
      const variants = new Map<string, Set<string>>();
      for (const node of asset.nodes) {
        const layer = node.extras?.avatarLayer,
          id = node.extras?.avatarVariant;
        if (!layer || !id) continue;
        if (!variants.has(layer)) variants.set(layer, new Set());
        variants.get(layer)!.add(id);
      }
      for (const [slot, ids] of Object.entries(FASHION_GARMENTS[model])) {
        for (const id of ids)
          expect(variants.get(slot)?.has(id), `${slot}/${id}`).toBe(true);
      }
      for (const preset of AVATAR_PRESET_ORDER) {
        for (const [slot, id] of Object.entries(FASHION_LOOKS[model][preset])) {
          expect(variants.get(slot)?.has(id), `${preset}/${slot}/${id}`).toBe(
            true,
          );
        }
        const thumb = readFileSync(
          join(process.cwd(), "public", fashionThumbnail(model, preset)),
        );
        expect(thumb.toString("ascii", 0, 4)).toBe("RIFF");
        expect(thumb.toString("ascii", 8, 12)).toBe("WEBP");
      }
    });
  });
}
