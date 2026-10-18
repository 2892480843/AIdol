import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarSceneUrl, avatarSceneAsset } from "@/lib/avatar-editorial";
import { normalizeAvatarConfig } from "@/lib/avatar-studio";

afterEach(() => vi.unstubAllEnvs());
describe("lossless avatar transfer cache", () => {
  it("versions the same selected high-quality asset by its build content, without changing variants", () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ASSET_REVISION", "a".repeat(64));
    const config = normalizeAvatarConfig({ model:"female", renderMode:"editorial", editorialLook:"dopamine" });
    for (const compact of [false, true]) {
      const asset = avatarSceneAsset(config, compact);
      expect(avatarSceneUrl(config, compact)).toBe(`${asset}?v=${"a".repeat(64)}`);
    }
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ASSET_REVISION", "b".repeat(64));
    expect(avatarSceneUrl(config, false)).toContain(`?v=${"b".repeat(64)}`);
  });
  it("keeps development assets loadable if no build revision is present", () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ASSET_REVISION", "");
    const config = normalizeAvatarConfig({model:"male"});
    expect(avatarSceneUrl(config, false)).toBe(avatarSceneAsset(config, false));
  });
});
