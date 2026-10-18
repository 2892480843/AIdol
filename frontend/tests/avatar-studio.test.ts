import { describe, expect, it } from "vitest";
import type { Item } from "@/lib/types";
import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR_CONFIG,
  avatarFittingHref,
  avatarLocalDate,
  avatarPaletteForItems,
  clampAvatarRotation,
  clampAvatarZoom,
  isValidAvatarDate,
  normalizeAvatarConfig,
  normalizeAvatarTitle,
} from "@/lib/avatar-studio";

const garment = (type: string, id: string, extra: object = {}) =>
  ({
    id,
    user_id: "owner-a",
    type,
    status: "ready",
    is_archived: false,
    needs_wash: false,
    primary_color: "blue",
    ...extra,
  }) as Item;
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("avatar studio configuration", () => {
  it("normalizes corrupt configuration to a complete safe default", () => {
    for (const input of [
      null,
      [],
      "male",
      { model: "unknown", preset: "bad", palette: { tops: "url(secret)" } },
    ]) {
      expect(normalizeAvatarConfig(input)).toEqual(DEFAULT_AVATAR_CONFIG);
    }
    expect(Object.keys(AVATAR_PRESETS)).toHaveLength(6);
  });
  it("preserves supported settings and only accepts complete hex colors", () => {
    const result = normalizeAvatarConfig({
      model: "male",
      pose: "editorial",
      light: "night",
      preset: "street",
      rotation: 70,
      zoom: 1.2,
      palette: { tops: "#ABCDEF", shoes: "red", extra: "#123456" },
    });
    expect(result).toMatchObject({
      model: "male",
      pose: "editorial",
      light: "night",
      preset: "street",
      rotation: 70,
      zoom: 1.2,
    });
    expect(result.palette).toEqual({
      ...AVATAR_PRESETS.street,
      tops: "#abcdef",
    });
  });
  it("does not expose shared mutable preset state", () => {
    const one = normalizeAvatarConfig({ preset: "sweet" });
    one.palette.tops = "#123456";
    expect(normalizeAvatarConfig({ preset: "sweet" }).palette.tops).toBe(
      AVATAR_PRESETS.sweet.tops,
    );
  });
  it("clamps nonfinite and extreme camera values", () => {
    expect(clampAvatarRotation(NaN)).toBe(DEFAULT_AVATAR_CONFIG.rotation);
    expect(clampAvatarRotation(-900)).toBe(-180);
    expect(clampAvatarRotation(900)).toBe(180);
    expect(clampAvatarZoom(Infinity)).toBe(1);
    expect(clampAvatarZoom(-2)).toBe(0.75);
    expect(clampAvatarZoom(4)).toBe(1.5);
  });
});

describe("avatar dates and names", () => {
  it.each(["2024-02-29", "2026-10-18", "0001-01-01", "9999-12-31"])(
    "accepts real local calendar date %s",
    (value) => {
      expect(isValidAvatarDate(value)).toBe(true);
    },
  );
  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "2026-1-01",
    "0000-01-01",
    "2026-10-18T00:00:00Z",
    "",
  ])("rejects impossible or non-date value %s", (value) => {
    expect(isValidAvatarDate(value)).toBe(false);
  });
  it("formats using local components rather than UTC conversion", () => {
    const local = new Date(2026, 9, 18, 0, 5);
    expect(avatarLocalDate(local)).toBe("2026-10-18");
    expect(avatarLocalDate(new Date(NaN))).toBe("");
  });
  it("normalizes whitespace, removes controls and preserves complete unicode characters", () => {
    expect(normalizeAvatarTitle("  周末\n造型\u0000  ")).toBe("周末 造型");
    const name = normalizeAvatarTitle("🧥".repeat(110));
    expect(Array.from(name)).toHaveLength(100);
    expect(name.endsWith("🧥")).toBe(true);
  });
});

describe("avatar wardrobe adapters", () => {
  it("uses actual item color mapping for supported slots, retaining other base colors", () => {
    const base = AVATAR_PRESETS.minimal;
    const items = [
      garment("t-shirt", firstId, { primary_color: "blue" }),
      garment("pants", secondId, { primary_color: "black" }),
    ];
    expect(avatarPaletteForItems(items, base)).toEqual({
      ...base,
      tops: "#4A7DB8",
      bottoms: "#1a1a1a",
    });
    expect(base.tops).toBe(AVATAR_PRESETS.minimal.tops);
  });
  it("ignores unavailable and unsupported garments instead of changing the preview", () => {
    expect(
      avatarPaletteForItems([
        garment("suit", firstId),
        garment("dress", firstId, { needs_wash: true }),
        garment("shirt", firstId, { is_archived: true }),
        garment("pants", firstId, { status: "processing" }),
      ]),
    ).toEqual(AVATAR_PRESETS.minimal);
  });
  it("delegates fitting links to the existing complementary slot contract", () => {
    const top = garment("shirt", firstId);
    const pants = garment("pants", secondId);
    expect(avatarFittingHref([top, pants])).toContain(
      "/dashboard/wardrobe/tryon?items=",
    );
    expect(avatarFittingHref([top, garment("dress", secondId)])).toBeNull();
    expect(avatarFittingHref([])).toBeNull();
  });
});
