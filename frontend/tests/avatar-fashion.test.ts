import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyAvatarWardrobe } from "@/components/avatar-studio/scene-model";
import {
  AVATAR_PRESETS,
  normalizeAvatarConfig,
  stepAvatarPreset,
} from "@/lib/avatar-studio";
import { fashionGarments } from "@/lib/avatar-fashion";
import type { Item } from "@/lib/types";

function mesh(layer: string, variant?: string) {
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  object.userData.avatarLayer = layer;
  if (variant) object.userData.avatarVariant = variant;
  return object;
}
describe("fashion silhouettes", () => {
  it("masks only skin covered by an actually visible variant and restores skin on look changes", () => {
    const root = new THREE.Group();
    const knit = mesh("tops", "knit"),
      tee = mesh("tops", "tee"),
      dress = mesh("dresses", "halter"),
      boots = mesh("shoes", "ankle-boots"),
      flats = mesh("shoes", "ballet-flats");
    const elbow = new THREE.MeshStandardMaterial(),
      foot = new THREE.MeshStandardMaterial();
    elbow.userData.avatarHiddenByVariants = ["tops:knit"];
    foot.userData.avatarHiddenByVariants = ["shoes:ankle-boots"];
    const body = new THREE.Mesh(new THREE.BoxGeometry(), [elbow, foot]);
    body.userData.avatarLayer = "body";
    root.add(body, knit, tee, dress, boots, flats);
    applyAvatarWardrobe(root, AVATAR_PRESETS.relaxed, false, false, {
      tops: "knit",
      shoes: "ankle-boots",
    });
    expect([elbow.visible, foot.visible]).toEqual([false, false]);
    applyAvatarWardrobe(root, AVATAR_PRESETS.sweet, false, false, {
      tops: "tee",
      shoes: "ballet-flats",
    });
    expect([elbow.visible, foot.visible]).toEqual([true, true]);
    applyAvatarWardrobe(root, AVATAR_PRESETS.elegant, true, false, {
      tops: "knit",
      shoes: "ballet-flats",
    });
    expect(elbow.visible).toBe(true);
  });
  it("shows one chosen silhouette per slot and preserves protected skin colors", () => {
    const root = new THREE.Group();
    const skin = mesh("body");
    const tee = mesh("tops", "tee");
    const cami = mesh("tops", "cami");
    const skirt = mesh("bottoms", "skirt");
    const pants = mesh("bottoms", "pants");
    root.add(skin, tee, cami, skirt, pants);
    applyAvatarWardrobe(root, AVATAR_PRESETS.sweet, false, false, {
      tops: "cami",
      bottoms: "skirt",
    });
    expect([tee.visible, cami.visible, skirt.visible, pants.visible]).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(
      (skin.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("ffffff");
  });
  it("inherits a multi-primitive garment variant and cannot leave a slot empty for a missing ID", () => {
    const root = new THREE.Group();
    const group = new THREE.Group();
    group.userData = { avatarLayer: "tops", avatarVariant: "tee" };
    const a = mesh("other"),
      b = mesh("other");
    delete a.userData.avatarLayer;
    delete b.userData.avatarLayer;
    group.add(a, b);
    const cami = mesh("tops", "cami");
    root.add(group, cami);
    applyAvatarWardrobe(root, AVATAR_PRESETS.minimal, false, false, {
      tops: "missing",
    });
    expect(group.visible && a.visible && b.visible).toBe(true);
    expect(cami.visible).toBe(false);
  });
  it("only the selected closed outerwear hides tops; dress mode never shows two dresses", () => {
    const root = new THREE.Group();
    const tee = mesh("tops", "tee");
    const open = mesh("outerwear", "open");
    const closed = mesh("outerwear", "closed");
    closed.userData.avatarReplacesTops = true;
    const slip = mesh("dresses", "slip"),
      midi = mesh("dresses", "midi");
    root.add(tee, open, closed, slip, midi);
    applyAvatarWardrobe(root, AVATAR_PRESETS.street, false, true, {
      outerwear: "open",
    });
    expect(tee.visible).toBe(true);
    expect(closed.visible).toBe(false);
    applyAvatarWardrobe(root, AVATAR_PRESETS.elegant, true, false, {
      dresses: "midi",
    });
    expect([tee.visible, slip.visible, midi.visible]).toEqual([
      false,
      false,
      true,
    ]);
  });
  it("keeps old untagged models compatible", () => {
    const root = new THREE.Group();
    const tee = mesh("tops"),
      pants = mesh("bottoms");
    root.add(tee, pants);
    applyAvatarWardrobe(root, AVATAR_PRESETS.minimal, false, false, {
      tops: "unknown",
    });
    expect(tee.visible && pants.visible).toBe(true);
  });
  it("never overlaps different shoe silhouettes", () => {
    const root = new THREE.Group();
    const sneakers = mesh("shoes", "sneakers"),
      boots = mesh("shoes", "ankle-boots"),
      flats = mesh("shoes", "ballet-flats");
    root.add(sneakers, boots, flats);
    applyAvatarWardrobe(root, AVATAR_PRESETS.sweet, false, false, {
      shoes: "ballet-flats",
    });
    expect([sneakers.visible, boots.visible, flats.visible]).toEqual([
      false,
      false,
      true,
    ]);
    applyAvatarWardrobe(root, AVATAR_PRESETS.street, false, false, {
      shoes: "ankle-boots",
    });
    expect([sneakers.visible, boots.visible, flats.visible]).toEqual([
      false,
      true,
      false,
    ]);
  });
  it("round-trips bounded garment choices in saved looks and ignores hostile or unknown slots", () => {
    const config = normalizeAvatarConfig({
      garments: {
        tops: "cropped-tee",
        bottoms: "wide-pants",
        body: "hidden",
        shoes: "a".repeat(200),
      },
    });
    expect(config.garments).toEqual({
      tops: "cropped-tee",
      bottoms: "wide-pants",
    });
    expect(normalizeAvatarConfig(config)).toEqual(config);
  });
  it("cycles the six complete looks in both directions", () => {
    expect(stepAvatarPreset("sweet", -1)).toBe("sport");
    expect(stepAvatarPreset("sport", 1)).toBe("sweet");
    expect(stepAvatarPreset("minimal", 1)).toBe("street");
  });
  it("adapts the sample cut to actual wardrobe categories and rejects incompatible gender overrides", () => {
    const config = normalizeAvatarConfig({
      model: "male",
      preset: "sweet",
      garments: { tops: "camisole", bottoms: "mini-skirt" },
    });
    expect(fashionGarments(config)).toMatchObject({
      tops: "polo",
      bottoms: "tailored",
    });
    const items = [
      { type: "sweater" },
      { type: "pants" },
      { type: "boots" },
    ] as Item[];
    expect(fashionGarments(config, items)).toMatchObject({
      tops: "knit",
      bottoms: "tailored",
      shoes: "ankle-boots",
    });
    expect(fashionGarments(config, [{ type: "polo" }] as Item[]).tops).toBe(
      "polo",
    );
  });
});
