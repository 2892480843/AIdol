// Tripo's GLB export omits the joint node transforms. Restore their rest positions
// from valid inverse bind matrices; never guess or accept corrupt matrix payloads.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4 } from "../../frontend/node_modules/three/build/three.module.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const [sex, source] = process.argv.slice(2);
if (!["female", "male"].includes(sex) || !source) throw new Error("Usage: repair-bind-pose.mjs female|male source.glb");
const raw = fs.readFileSync(source), length = raw.readUInt32LE(12);
if (raw.readUInt32LE(0) !== 0x46546c67 || raw.readUInt32LE(8) !== raw.length) throw new Error("Incomplete GLB");
const doc = JSON.parse(raw.subarray(20, 20 + length));
const binary = raw.subarray(28 + length), skin = doc.skins[0];
const accessor = doc.accessors[skin.inverseBindMatrices], view = doc.bufferViews[accessor.bufferView];
const start = view.byteOffset + (accessor.byteOffset ?? 0), worlds = new Map();
for (let joint = 0; joint < skin.joints.length; joint++) {
  const matrix = new Matrix4().fromArray(Array.from({ length: 16 }, (_, i) => binary.readFloatLE(start + joint * 64 + i * 4)));
  if (!matrix.elements.every(Number.isFinite) || Math.abs(matrix.elements[15] - 1) > 0.001 || Math.abs(matrix.determinant()) < 0.5 || Math.max(...matrix.elements.map(Math.abs)) > 10)
    throw new Error(`Corrupt inverse bind matrix at joint ${joint}; re-export the source, do not repair by guessing`);
  worlds.set(skin.joints[joint], matrix.invert());
}
const parents = new Map();
doc.nodes.forEach((node, index) => node.children?.forEach(child => parents.set(child, index)));
for (const [index, world] of worlds) {
  const parent = worlds.get(parents.get(index)) ?? new Matrix4();
  doc.nodes[index].matrix = parent.clone().invert().multiply(world).toArray();
  delete doc.nodes[index].translation;
  delete doc.nodes[index].rotation;
  delete doc.nodes[index].scale;
}
const json = Buffer.from(JSON.stringify(doc)), pad = Buffer.alloc((4 - json.length % 4) % 4, 32), tail = raw.subarray(20 + length), header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + json.length + pad.length + tail.length, 8);
header.writeUInt32LE(json.length + pad.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const output = path.join(here, "originals", `${sex}-repaired-8k.glb`);
fs.writeFileSync(output, Buffer.concat([header, json, pad, tail]));
console.log(JSON.stringify({ sex, source, output, restoredJointTransforms: worlds.size, binaryPayloadUnchanged: true }));
