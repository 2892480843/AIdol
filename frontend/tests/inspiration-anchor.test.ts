import { describe, expect, it } from "vitest";
import { matchFormulaWithAnchor } from "@/lib/inspiration/anchor";
import { matchFormula, type OutfitFormula } from "@/lib/inspiration/matching";
import type { Item } from "@/lib/types";

const item = (id: string, type = "shirt", extra: Partial<Item> = {}): Item =>
  ({
    id,
    type,
    user_id: "owner-a",
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
    { id: "top", types: ["shirt", "t-shirt"] },
    { id: "bottom", types: ["pants"] },
    { id: "bag", types: ["bag"], optional: true },
  ],
};

describe("one item across compatible inspiration formulas", () => {
  it("preserves ordinary matching exactly when no item is anchored", () => {
    const items = [item("top"), item("bottom", "pants"), item("bag", "bag")];
    const overrides = { top: "top" };
    const skipped = new Set(["bag"]);
    const result = matchFormulaWithAnchor(
      formula,
      items,
      null,
      overrides,
      skipped,
    );
    expect(result).toEqual({
      match: matchFormula(formula, items, overrides, skipped),
      anchorSlotId: null,
      compatible: true,
    });
  });
  it.each([
    { status: "processing" },
    { status: "error" },
    { status: "archived" },
    { is_archived: true },
    { needs_wash: true },
    { type: "made-up" },
  ] as Partial<Item>[])(
    "rejects ineligible anchor %j instead of silently substituting a different item",
    (extra) => {
      const items = [
        item("anchor", "shirt", extra),
        item("usable"),
        item("bottom", "pants"),
      ];
      const result = matchFormulaWithAnchor(formula, items, "anchor");
      expect(result).toMatchObject({ compatible: false, anchorSlotId: null });
      expect(result.match).toEqual(matchFormula(formula, items));
      expect(result.match.slots[0].item?.id).toBe("usable");
    },
  );
  it.each(["missing", ""])(
    "rejects absent anchor %j in the loaded subset",
    (anchorId) => {
      expect(
        matchFormulaWithAnchor(formula, [item("usable")], anchorId),
      ).toMatchObject({ compatible: false, anchorSlotId: null });
    },
  );
  it("reports an eligible but incompatible category and does not invent a slot", () => {
    const result = matchFormulaWithAnchor(
      formula,
      [item("dress", "dress"), item("top")],
      "dress",
    );
    expect(result).toMatchObject({ compatible: false, anchorSlotId: null });
    expect(result.match.slots.some(({ item }) => item?.id === "dress")).toBe(
      false,
    );
  });
  it("keeps the anchor despite higher wear count and preserves unrelated manual choices", () => {
    const items = [
      item("anchor", "shirt", { wear_count: 20 }),
      item("less-worn"),
      item("pants", "pants"),
      item("chosen-pants", "pants", { wear_count: 10 }),
    ];
    const result = matchFormulaWithAnchor(formula, items, "anchor", {
      top: "less-worn",
      bottom: "chosen-pants",
    });
    expect(result).toMatchObject({ compatible: true, anchorSlotId: "top" });
    expect(result.match.slots.map(({ item }) => item?.id ?? null)).toEqual([
      "anchor",
      "chosen-pants",
      null,
    ]);
    expect(result.match).toMatchObject({
      matched: 2,
      required: 2,
      complete: true,
    });
  });
  it("treats color as a hint rather than replacing an explicitly anchored item", () => {
    const neutral: OutfitFormula = {
      ...formula,
      slots: [{ id: "top", types: ["shirt"], color: "neutral" }],
    };
    const result = matchFormulaWithAnchor(
      neutral,
      [
        item("anchor", "shirt", { primary_color: "red", wear_count: 10 }),
        item("white", "shirt", { primary_color: "white" }),
      ],
      "anchor",
    );
    expect(result).toMatchObject({ compatible: true, anchorSlotId: "top" });
    expect(result.match.slots[0]).toMatchObject({
      item: { id: "anchor" },
      colorSatisfied: false,
    });
    expect(result.match.complete).toBe(true);
  });
  it("chooses maximum required coverage for overlapping broad and narrow categories", () => {
    const overlap: OutfitFormula = {
      id: "overlap",
      occasion: "casual",
      slots: [
        { id: "broad", types: ["shirt", "t-shirt"] },
        { id: "narrow", types: ["shirt"] },
        { id: "extra", types: ["shirt"], optional: true },
      ],
    };
    const result = matchFormulaWithAnchor(
      overlap,
      [item("anchor"), item("tee", "t-shirt")],
      "anchor",
    );
    expect(result.anchorSlotId).toBe("narrow");
    expect(result.match).toMatchObject({
      matched: 2,
      required: 2,
      complete: true,
    });
    expect(result.match.slots.map(({ item }) => item?.id ?? null)).toEqual([
      "tee",
      "anchor",
      null,
    ]);
  });
  it("prefers a required slot over an earlier optional slot when coverage ties", () => {
    const overlap: OutfitFormula = {
      id: "overlap",
      occasion: "casual",
      slots: [
        { id: "extra", types: ["shirt"], optional: true },
        { id: "main", types: ["shirt"] },
      ],
    };
    const result = matchFormulaWithAnchor(
      overlap,
      [item("anchor"), item("other")],
      "anchor",
    );
    expect(result.anchorSlotId).toBe("main");
    expect(result.match.slots[1].item?.id).toBe("anchor");
  });
  it("uses declaration order for equally complete placements and strips duplicate anchor overrides", () => {
    const overlap: OutfitFormula = {
      id: "overlap",
      occasion: "casual",
      slots: [
        { id: "first", types: ["shirt"] },
        { id: "second", types: ["shirt"] },
      ],
    };
    const result = matchFormulaWithAnchor(
      overlap,
      [item("anchor"), item("other")],
      "anchor",
      { first: "other", second: "anchor" },
    );
    expect(result.anchorSlotId).toBe("first");
    const selected = result.match.slots.flatMap(({ item }) =>
      item ? [item.id] : [],
    );
    expect(selected).toEqual(["anchor", "other"]);
    expect(new Set(selected).size).toBe(selected.length);
  });
  it("restores only the anchored optional slot and keeps other skipped slots out of the result", () => {
    const optional: OutfitFormula = {
      ...formula,
      slots: [
        ...formula.slots,
        { id: "layer", types: ["jacket"], optional: true },
      ],
    };
    const skipped = new Set(["bag", "layer"]);
    const result = matchFormulaWithAnchor(
      optional,
      [
        item("top"),
        item("pants", "pants"),
        item("anchor", "bag"),
        item("jacket", "jacket"),
      ],
      "anchor",
      {},
      skipped,
    );
    expect(result).toMatchObject({ compatible: true, anchorSlotId: "bag" });
    expect(result.match.slots[2]).toMatchObject({
      item: { id: "anchor" },
      skipped: false,
    });
    expect(result.match.slots[3]).toMatchObject({ item: null, skipped: true });
    expect(result.match.required).toBe(2);
    expect(Array.from(skipped)).toEqual(["bag", "layer"]);
  });
  it("remains compatible with honest missing categories rather than filling them with placeholders", () => {
    const result = matchFormulaWithAnchor(formula, [item("anchor")], "anchor");
    expect(result).toMatchObject({ compatible: true, anchorSlotId: "top" });
    expect(result.match).toMatchObject({
      matched: 1,
      required: 2,
      complete: false,
    });
    expect(result.match.slots[1].item).toBeNull();
  });
  it("does not mutate formula, inventory, overrides or the skip set", () => {
    const items = [item("anchor"), item("other"), item("pants", "pants")];
    const overrides = Object.freeze({ top: "other", bag: "anchor" });
    const skipped = new Set(["bag"]);
    const before = JSON.stringify({
      formula,
      items,
      overrides,
      skipped: Array.from(skipped),
    });
    items.forEach(Object.freeze);
    matchFormulaWithAnchor(formula, items, "anchor", overrides, skipped);
    expect(
      JSON.stringify({
        formula,
        items,
        overrides,
        skipped: Array.from(skipped),
      }),
    ).toBe(before);
  });
});
