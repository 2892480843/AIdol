import { describe, expect, it } from "vitest";
import { matchFormula, type OutfitFormula } from "@/lib/inspiration/matching";
import type { Item } from "@/lib/types";

const item = (id: string, type = "shirt", extra: Partial<Item> = {}): Item =>
  ({
    id,
    type,
    user_id: "a",
    status: "ready",
    is_archived: false,
    needs_wash: false,
    wear_count: 0,
    colors: [],
    tags: {},
    ...extra,
  }) as Item;
const formula: OutfitFormula = {
  id: "everyday",
  occasion: "casual",
  slots: [
    { id: "top", types: ["shirt", "t-shirt"], color: "neutral" },
    { id: "bottom", types: ["pants"] },
    { id: "extra", types: ["bag"], optional: true },
  ],
};

describe("honest wardrobe formula matching", () => {
  it("ignores attempts to skip required slots", () => {
    const requiredOnly: OutfitFormula = {
      id: "required",
      occasion: "casual",
      slots: [{ id: "top", types: ["shirt"] }],
    };
    const result = matchFormula(
      requiredOnly,
      [item("top")],
      {},
      new Set(["top"]),
    );
    expect(result).toMatchObject({ matched: 1, required: 1, complete: true });
    expect(result.slots[0]).toMatchObject({
      skipped: false,
      item: { id: "top" },
    });
  });
  it("releases an optional override so the skipped garment can fill another compatible slot", () => {
    const overlap: OutfitFormula = {
      id: "overlap",
      occasion: "casual",
      slots: [
        { id: "extra", types: ["shirt"], optional: true },
        { id: "top", types: ["shirt"] },
      ],
    };
    const result = matchFormula(
      overlap,
      [item("only")],
      { extra: "only" },
      new Set(["extra"]),
    );
    expect(result).toMatchObject({ matched: 1, required: 1, complete: true });
    expect(result.slots[0]).toMatchObject({
      skipped: true,
      item: null,
      candidates: [],
    });
    expect(result.slots[1].item?.id).toBe("only");
  });
  it("counts only required categories and preserves an honestly missing slot", () => {
    const result = matchFormula(formula, [item("top"), item("bag", "bag")]);
    expect(result).toMatchObject({ matched: 1, required: 2, complete: false });
    expect(result.slots[1].item).toBeNull();
    expect(result.slots[2].item?.id).toBe("bag");
  });
  it("excludes processing, archived, wash-needed and unknown categories without requiring a photo", () => {
    const result = matchFormula(formula, [
      item("processing", "shirt", { status: "processing" }),
      item("archived", "shirt", { is_archived: true }),
      item("wash", "shirt", { needs_wash: true }),
      item("unknown", "made-up"),
      item("ready"),
    ]);
    expect(result.slots[0].candidates.map((i) => i.id)).toEqual(["ready"]);
    expect(result.slots[0].item?.id).toBe("ready");
  });
  it("prioritizes less-worn items, deduplicates IDs and reports unknown color as unknown", () => {
    const result = matchFormula(formula, [
      item("worn", "shirt", { wear_count: 9, primary_color: "white" }),
      item("fresh", "shirt", { wear_count: 1, primary_color: "mystery" }),
      item("fresh"),
    ]);
    expect(result.slots[0].item?.id).toBe("fresh");
    expect(result.slots[0].colorSatisfied).toBeNull();
    expect(result.slots[0].candidates).toHaveLength(2);
  });
  it("uses color as a soft hint without blocking required category completion", () => {
    const result = matchFormula(formula, [
      item("red", "shirt", { primary_color: "red" }),
      item("pants", "pants"),
    ]);
    expect(result.complete).toBe(true);
    expect(result.slots[0].colorSatisfied).toBe(false);
  });
  it("reserves valid overrides before automatic selection and excludes items used by another slot", () => {
    const overlapping: OutfitFormula = {
      ...formula,
      slots: [
        { id: "first", types: ["shirt"] },
        { id: "second", types: ["shirt"] },
      ],
    };
    const result = matchFormula(overlapping, [item("a"), item("b")], {
      second: "a",
    });
    expect(result.slots.map((s) => s.item?.id)).toEqual(["b", "a"]);
    expect(result.slots[0].candidates.map((i) => i.id)).toEqual(["b"]);
    expect(result.slots[1].candidates.map((i) => i.id)).toEqual(["a"]);
  });
  it("never duplicates an override or accepts an ineligible override", () => {
    const overlapping = {
      ...formula,
      slots: [
        { id: "a", types: ["shirt"] },
        { id: "b", types: ["shirt"] },
      ],
    };
    const result = matchFormula(
      overlapping,
      [item("only"), item("dirty", "shirt", { needs_wash: true })],
      { a: "only", b: "only" },
    );
    expect(result.slots.filter((s) => s.item).map((s) => s.item!.id)).toEqual([
      "only",
    ]);
  });
  it("finds all required categories when broad and narrow slots overlap", () => {
    const overlapping = {
      ...formula,
      slots: [
        { id: "broad", types: ["shirt", "t-shirt"] },
        { id: "narrow", types: ["shirt"] },
      ],
    };
    const result = matchFormula(overlapping, [
      item("a-shirt"),
      item("b-tee", "t-shirt"),
    ]);
    expect(result.complete).toBe(true);
    expect(result.slots.map((s) => s.item?.id)).toEqual(["b-tee", "a-shirt"]);
  });
  it("compares a same-as-first hint using canonical color aliases", () => {
    const sameColor = {
      ...formula,
      slots: [
        { id: "top", types: ["shirt"] },
        { id: "bottom", types: ["pants"], color: "same-as-first" as const },
      ],
    };
    const result = matchFormula(sameColor, [
      item("top", "shirt", { primary_color: "grey" }),
      item("bottom", "pants", { primary_color: "gray" }),
    ]);
    expect(result.slots[1].colorSatisfied).toBe(true);
  });
});
