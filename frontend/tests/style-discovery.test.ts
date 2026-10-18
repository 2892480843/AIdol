import { describe, expect, it } from "vitest";
import { STYLE_FORMULAS } from "@/lib/inspiration/catalog";
import { MODEL_LOOKS } from "@/lib/model-looks";
import {
  STYLE_CATEGORIES,
  STYLE_IDS,
  STYLE_LOOKS,
  filterStyleLooks,
  parseStyleId,
  type StyleLook,
} from "@/lib/style-discovery";

describe("style discovery catalogue", () => {
  it("offers six distinct styles with usable inspiration links and three-color palettes", () => {
    expect(STYLE_IDS).toEqual([
      "street",
      "sport",
      "cityboy",
      "clean",
      "retro",
      "french",
    ]);
    expect(STYLE_CATEGORIES.map(({ id }) => id)).toEqual(STYLE_IDS);
    for (const category of STYLE_CATEGORIES) {
      expect(category.palette).toHaveLength(3);
      expect(
        category.palette.every((color) => /^#[0-9a-f]{6}$/i.test(color)),
      ).toBe(true);
      expect(STYLE_FORMULAS.some(({ id }) => id === category.formulaId)).toBe(
        true,
      );
    }
  });

  it("keeps all four existing model images, identifiers and frame positions intact", () => {
    expect(STYLE_LOOKS.slice(0, 4)).toEqual(
      MODEL_LOOKS.map((look) => ({
        ...look,
        styleId: ["casual", "office"].includes(look.key) ? "clean" : "cityboy",
      })),
    );
  });

  it("adds two looks for each remaining style and uses every new contact-sheet frame exactly once", () => {
    expect(STYLE_LOOKS).toHaveLength(12);
    expect(new Set(STYLE_LOOKS.map(({ id }) => id)).size).toBe(12);
    expect(new Set(STYLE_LOOKS.map(({ key }) => key)).size).toBe(12);
    for (const styleId of STYLE_IDS) {
      expect(
        STYLE_LOOKS.filter((look) => look.styleId === styleId),
      ).toHaveLength(2);
    }
    const expected = [
      ["streetBomber", "street", "a", 0, 0],
      ["streetShell", "street", "a", 0, 1],
      ["sportTrack", "sport", "a", 1, 0],
      ["sportZip", "sport", "a", 1, 1],
      ["retroArgyle", "retro", "b", 0, 0],
      ["retroLeather", "retro", "b", 0, 1],
      ["frenchStripe", "french", "b", 1, 0],
      ["frenchBlouse", "french", "b", 1, 1],
    ];
    expect(
      STYLE_LOOKS.slice(4).map((look) => [
        look.key,
        look.styleId,
        look.src.includes("-a-") ? "a" : "b",
        look.frame.row,
        look.frame.column,
      ]),
    ).toEqual(expected);
    expect(
      STYLE_LOOKS.slice(4).every(({ src }) =>
        /^\/images\/style-discovery-[ab]-20261017\.webp$/.test(src),
      ),
    ).toBe(true);
  });

  it.each([null, "", "all", "unknown", "STREET", " street "])(
    "normalizes unsupported URL style %j to all",
    (value) => expect(parseStyleId(value)).toBe("all"),
  );

  it("accepts every known style identifier", () => {
    for (const styleId of STYLE_IDS)
      expect(parseStyleId(styleId)).toBe(styleId);
  });
});

describe("localized style search", () => {
  const label = (look: StyleLook) => `${look.styleId} ${look.key}`;

  it("returns a fresh ordered array for blank searches without changing the catalogue", () => {
    const before = JSON.stringify(STYLE_LOOKS);
    const results = filterStyleLooks("all", " \n\t ", label);
    expect(results).toEqual(STYLE_LOOKS);
    expect(results).not.toBe(STYLE_LOOKS);
    results.reverse();
    expect(JSON.stringify(STYLE_LOOKS)).toBe(before);
  });

  it("intersects the selected category and current-language label rather than searching English identifiers", () => {
    const localizedLabel = (look: StyleLook) =>
      look.key === "streetBomber" ? "街头 街头飞行夹克 工装" : "其他风格";
    expect(
      filterStyleLooks("street", " 工装 ", localizedLabel).map(
        ({ key }) => key,
      ),
    ).toEqual(["streetBomber"]);
    expect(filterStyleLooks("sport", "工装", localizedLabel)).toEqual([]);
    expect(filterStyleLooks("street", "streetBomber", localizedLabel)).toEqual(
      [],
    );
  });

  it("normalizes compatibility characters and folds case on both query and localized labels", () => {
    const localizedLabel = (look: StyleLook) =>
      look.key === "streetBomber" ? "ＳＴＲＥＥＴ Bomber Straße" : "other";
    expect(
      filterStyleLooks("all", " street bomber ", localizedLabel).map(
        ({ key }) => key,
      ),
    ).toEqual(["streetBomber"]);
    expect(
      filterStyleLooks("all", "STRASSE", localizedLabel).map(({ key }) => key),
    ).toEqual(["streetBomber"]);
    expect(
      filterStyleLooks("all", "ｂｏｍｂｅｒ", localizedLabel).map(
        ({ key }) => key,
      ),
    ).toEqual(["streetBomber"]);
  });

  it("preserves original order for multiple matches and returns an empty array for no matches", () => {
    expect(
      filterStyleLooks("street", "street", label).map(({ key }) => key),
    ).toEqual(["streetBomber", "streetShell"]);
    expect(filterStyleLooks("all", "no matching outfit", label)).toEqual([]);
  });
});
