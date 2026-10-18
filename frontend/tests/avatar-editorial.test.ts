import { describe, expect, it } from "vitest";
import { normalizeAvatarConfig } from "@/lib/avatar-studio";
import { avatarSceneAsset, avatarSceneIdentity, editorialLookKey, editorialLooks, editorialThumbnail, stepEditorialLook } from "@/lib/avatar-editorial";

describe("editorial avatar presentation", () => {
  it("restores the high-detail model while preserving old mix-and-match bookmarks", () => {
    expect(normalizeAvatarConfig({ renderMode: "editorial" }).renderMode).toBe("editorial");
    expect(normalizeAvatarConfig({}).renderMode).toBeUndefined();
    expect(normalizeAvatarConfig({ renderMode: "https://untrusted.test/model.glb" }).renderMode).toBeUndefined();
  });

  it("uses only bundled model paths and a smaller texture set on compact devices", () => {
    const config = normalizeAvatarConfig({ model: "female", renderMode: "editorial" });
    expect(avatarSceneAsset(config, false)).toBe("/models/avatar/editorial-v1/female.glb");
    expect(avatarSceneAsset(config, true)).toBe("/models/avatar/editorial-v1/female-mobile.glb");
    expect(avatarSceneAsset(normalizeAvatarConfig({ model: "male" }), true)).toBe("/models/avatar/v2/male.glb");
  });

  it("invalidates the rendered scene when switching model families, independently of colors", () => {
    const old = normalizeAvatarConfig({ model: "female" });
    const editorial = normalizeAvatarConfig({ model: "female", renderMode: "editorial" });
    expect(avatarSceneIdentity(old)).not.toBe(avatarSceneIdentity(editorial));
    expect(avatarSceneIdentity({ ...editorial, rotation: 90 })).toBe(avatarSceneIdentity(editorial));
  });
  it("cycles complete detailed outfits and restores only trusted outfit identifiers", () => {
    const first = normalizeAvatarConfig({ renderMode: "editorial", model: "female" });
    const street = normalizeAvatarConfig({ ...first, editorialLook: "street" });
    expect(street.editorialLook).toBe("street");
    expect(avatarSceneAsset(street, false)).toBe("/models/avatar/editorial-v1/female-street.glb");
    expect(avatarSceneAsset({ ...street, model: "male" }, true)).toBe("/models/avatar/editorial-v1/male-street-mobile.glb");
    expect(avatarSceneIdentity(street)).not.toBe(avatarSceneIdentity(first));
    expect(stepEditorialLook(undefined, 1)).toBe("street");
    expect(stepEditorialLook("street", 1)).toBe("refined");
    expect(stepEditorialLook(undefined, -1)).toBe("dopamine");
    expect(normalizeAvatarConfig({ ...first, editorialLook: "https://untrusted.test/a.glb" }).editorialLook).toBeUndefined();
    expect(avatarSceneIdentity({ ...street, renderMode: undefined })).toBe(avatarSceneIdentity({ ...first, renderMode: undefined }));
  });
  it("adds refined characters without changing the identity or paths of saved classic looks", () => {
    const refined = normalizeAvatarConfig({ renderMode: "editorial", editorialLook: "refined", model: "female" });
    expect(refined.editorialLook).toBe("refined");
    expect(avatarSceneAsset(refined, false)).toBe("/models/avatar/beauty-v2/female.glb");
    expect(avatarSceneAsset({ ...refined, model: "male" }, true)).toBe("/models/avatar/beauty-v2/male-mobile.glb");
    expect(editorialThumbnail(refined)).toBe("/models/avatar/beauty-v2/female.webp");
    expect(editorialLookKey("female", "refined")).toBe("editorialFemaleRefined");
    expect(avatarSceneIdentity(refined)).toBe("editorial:female:refined");
    expect(stepEditorialLook("refined", 1)).toBe("dopamine");
    expect(stepEditorialLook("refined", -1)).toBe("street");
  });
  it("offers the dopamine reference character only where an actual matching asset exists", () => {
    const config = normalizeAvatarConfig({ model: "female", renderMode: "editorial", editorialLook: "dopamine" });
    expect(config.editorialLook).toBe("dopamine");
    expect(avatarSceneAsset(config, false)).toBe("/models/avatar/dopamine-v1/female.glb");
    expect(avatarSceneAsset(config, true)).toBe("/models/avatar/dopamine-v1/female-mobile.glb");
    expect(editorialThumbnail(config)).toBe("/models/avatar/dopamine-v1/female.webp");
    expect(editorialLookKey("female", "dopamine")).toBe("editorialFemaleDopamine");
    expect(editorialLooks("female")).toContain("dopamine");
    expect(editorialLooks("male")).not.toContain("dopamine");
    expect(stepEditorialLook("refined", 1, "male")).toBeUndefined();
    const male = normalizeAvatarConfig({ ...config, model: "male" });
    expect(male.editorialLook).toBe("refined");
    expect(avatarSceneAsset(male, false)).toBe("/models/avatar/beauty-v2/male.glb");
    const unnormalizedMale = { ...config, model: "male" as const };
    expect(avatarSceneAsset(unnormalizedMale, false)).toBe(avatarSceneAsset(male, false));
    expect(editorialThumbnail(unnormalizedMale)).toBe(editorialThumbnail(male));
    expect(avatarSceneIdentity(unnormalizedMale)).toBe(avatarSceneIdentity(male));
  });
});
