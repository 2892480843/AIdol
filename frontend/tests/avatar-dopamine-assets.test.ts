// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";

const directory = join(process.cwd(), "public/models/avatar/dopamine-v1");
const provenance = JSON.parse(readFileSync(join(directory, "PROVENANCE.json"), "utf8"));

function model(name: string) {
  const raw = readFileSync(join(directory, name));
  const length = raw.readUInt32LE(12);
  return { raw, doc: JSON.parse(raw.subarray(20, 20 + length).toString()), binary: raw.subarray(28 + length) };
}

describe("reference-derived dopamine character", () => {
  for (const name of ["female.glb", "female-mobile.glb"]) {
    it(`loads ${name} as a coherent, self-contained full-body reconstruction`, async () => {
      const { raw, doc, binary } = model(name);
      expect(raw.readUInt32LE(0)).toBe(0x46546c67);
      expect(raw.readUInt32LE(8)).toBe(raw.length);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(provenance.models.female.variants[name].sha256);
      expect(raw.length).toBeLessThan(name.includes("mobile") ? 24_000_000 : 40_000_000);
      expect(doc.nodes).toHaveLength(1);
      expect(doc.meshes).toHaveLength(1);
      expect(doc.skins).toBeUndefined();
      expect(doc.images).toHaveLength(3);
      expect(doc.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(true);
      for (const view of doc.bufferViews) expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(binary.length);
      for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
        const position = doc.accessors[primitive.attributes.POSITION];
        const indices = doc.accessors[primitive.indices];
        expect(indices.count / 3).toBeGreaterThanOrEqual(149_999);
        expect(indices.max[0]).toBeLessThan(position.count);
        expect(position.min.every(Number.isFinite)).toBe(true);
        expect(position.max.every(Number.isFinite)).toBe(true);
        expect(position.min[1]).toBeGreaterThanOrEqual(0);
        expect(position.max[1]).toBeGreaterThan(position.min[1]);
        for (const [attribute, index] of Object.entries({ ...primitive.attributes, indices: primitive.indices })) {
          const view = doc.bufferViews[doc.accessors[index as number].bufferView];
          expect(createHash("sha256").update(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)).digest("hex"))
            .toBe(provenance.original_geometry_views[attribute]);
        }
      }
      for (const material of doc.materials) {
        expect(material.extras.avatarRecolor).toBe(false);
        expect(material.pbrMetallicRoughness.metallicFactor).toBe(0);
      }
      for (const image of doc.images) {
        expect(image.uri).toBeUndefined();
        const view = doc.bufferViews[image.bufferView];
        const metadata = await sharp(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)).metadata();
        expect(metadata.width).toBeGreaterThanOrEqual(2048);
        expect(metadata.width).toBeLessThanOrEqual(name.includes("mobile") ? 4096 : 8192);
      }
    });
  }

  it("preserves identical facial/body geometry in the smaller mobile texture package", () => {
    const desktop = model("female.glb");
    const mobile = model("female-mobile.glb");
    for (let index = 0; index < desktop.doc.accessors.length; index++) {
      const left = desktop.doc.bufferViews[desktop.doc.accessors[index].bufferView];
      const right = mobile.doc.bufferViews[mobile.doc.accessors[index].bufferView];
      expect(desktop.binary.subarray(left.byteOffset, left.byteOffset + left.byteLength).equals(
        mobile.binary.subarray(right.byteOffset, right.byteOffset + right.byteLength),
      )).toBe(true);
    }
  });

  it("includes an actual rendered outfit thumbnail and a readable source notice", async () => {
    const thumbnail = await sharp(join(directory, "female.webp")).metadata();
    expect([thumbnail.width, thumbnail.height]).toEqual([160, 220]);
    expect(readFileSync(join(directory, "NOTICE.txt"), "utf8")).toContain("fixed-pose");
  });
});
