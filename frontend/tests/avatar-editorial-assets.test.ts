// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

const directory = join(process.cwd(), "public/models/avatar/editorial-v1");
const manifest = JSON.parse(readFileSync(join(directory, "PROVENANCE.json"), "utf8"));

describe("published detailed fashion characters", () => {
  for (const model of ["female", "male", "female-street", "male-street", "female-refined", "male-refined"]) {
    for (const suffix of ["", "-mobile"]) {
      it(`ships a complete self-contained ${model}${suffix} with complete geometry and PBR`, () => {
        const refined = model.endsWith("-refined");
        const assets = refined ? join(directory, "../beauty-v2") : directory;
        const name = `${model.replace("-refined", "")}${suffix}.glb`;
        const raw = readFileSync(join(assets, name));
        const source = refined ? JSON.parse(readFileSync(join(assets, "PROVENANCE.json"), "utf8")) : model.endsWith("-street") ? JSON.parse(readFileSync(join(directory, "PROVENANCE-STREET.json"), "utf8")) : manifest;
        const expected = source.models[model.replace(/-(street|refined)$/, "")].variants[name];
        expect(raw.readUInt32LE(0)).toBe(0x46546c67);
        expect(raw.readUInt32LE(4)).toBe(2);
        expect(raw.readUInt32LE(8)).toBe(raw.length);
        expect(raw.length).toBe(expected.bytes);
        expect(raw.length).toBeLessThan(refined ? (suffix ? 16_000_000 : 26_000_000) : (suffix ? 9_000_000 : 16_000_000));
        expect(createHash("sha256").update(raw).digest("hex")).toBe(expected.sha256);
        const jsonLength = raw.readUInt32LE(12);
        const asset = JSON.parse(raw.subarray(20, 20 + jsonLength).toString());
        // The upstream rig export was invalid. These fixed-pose web surfaces
        // must never accidentally reintroduce broken skinning or pretend to animate.
        expect(asset.skins).toBeUndefined();
        expect(asset.nodes).toHaveLength(1);
        expect(asset.nodes[0].skin).toBeUndefined();
        expect(asset.images).toHaveLength(3);
        expect(asset.buffers.every((b: { uri?: string; }) => !b.uri)).toBe(true);
        expect(asset.images.every((im: { uri?: string; bufferView?: number; }) => !im.uri && Number.isInteger(im.bufferView))).toBe(true);
        expect(asset.materials[0].normalTexture).toBeDefined();
        expect(asset.materials[0].pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
        expect(asset.materials[0].extras.avatarRecolor).toBe(false);
        const binaryLength = raw.length - 28 - jsonLength;
        for (const view of asset.bufferViews) expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(binaryLength);
        for (const mesh of asset.meshes) for (const primitive of mesh.primitives) {
          expect(primitive.attributes.JOINTS_0).toBeUndefined();
          expect(primitive.attributes.WEIGHTS_0).toBeUndefined();
          expect(asset.accessors[primitive.indices].count / 3).toBeGreaterThan(refined ? 149_000 : 99_000);
        }
      });
    }
  }
  for (const model of ["female", "male"]) {
    it(`includes the actual rendered refined ${model} thumbnail`, async () => {
      const image = await sharp(join(directory, "../beauty-v2", `${model}.webp`)).metadata();
      expect(image.format).toBe("webp");
      expect([image.width, image.height]).toEqual([160, 220]);
    });
  }
});
