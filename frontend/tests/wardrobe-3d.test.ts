import { describe, expect, it } from "vitest";
import { colorSwatch } from "@/lib/colors";
import type { Item } from "@/lib/types";
import {
  DEFAULT_RACK_FILTERS,
  filterRackItems,
  rackGroupForType,
  rackItemColor,
  rackWindow,
} from "@/lib/wardrobe-3d";

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    user_id: "owner-a",
    type: "shirt",
    name: id,
    favorite: false,
    image_path: `${id}.jpg`,
    tags: { colors: [], style: [], season: [] },
    colors: [],
    status: "ready",
    ai_processed: true,
    tagging_status: "tagged",
    wear_count: 0,
    suggestion_count: 0,
    acceptance_count: 0,
    wears_since_wash: 0,
    needs_wash: false,
    effective_wash_interval: 3,
    additional_images: [],
    is_archived: false,
    created_at: "2026-10-18T01:00:00Z",
    updated_at: "2026-10-18T01:00:00Z",
    ...overrides,
  };
}
const label = (value: Item) =>
  value.type === "shirt" ? "宽松衬衫" : value.type;

describe("3D wardrobe filters", () => {
  it("keeps unknown ready garments and laundry, excludes processing/errors/archives, and never mutates inventory", () => {
    const items = [
      item("clean"),
      item("laundry", { needs_wash: true }),
      item("unknown", { type: "future-garment" }),
      item("busy", { status: "processing" }),
      item("failed", { status: "error" }),
      item("archived", { is_archived: true }),
    ];
    const before = structuredClone(items);
    expect(
      filterRackItems(items, DEFAULT_RACK_FILTERS, label).map((x) => x.id),
    ).toEqual(["clean", "laundry", "unknown"]);
    expect(items).toEqual(before);
  });
  it.each([
    ["t-shirt", "tops"],
    ["hoodie", "tops"],
    ["cardigan", "outerwear"],
    ["coat", "outerwear"],
    ["skirt", "bottoms"],
    ["jumpsuit", "dresses"],
    ["sneakers", "shoes"],
    ["socks", "accessories"],
    ["unknown", "other"],
  ])("groups %s as %s", (type, group) =>
    expect(rackGroupForType(type)).toBe(group),
  );
  it("intersects category, favorite, laundry and localized keyword filters", () => {
    const items = [
      item("match", { favorite: true, needs_wash: true }),
      item("clean", { favorite: true }),
      item("not-favorite", { needs_wash: true }),
      item("pants", { type: "pants", favorite: true, needs_wash: true }),
    ];
    expect(
      filterRackItems(
        items,
        {
          ...DEFAULT_RACK_FILTERS,
          group: "tops",
          favoritesOnly: true,
          wash: "wash",
          query: "衬衫",
        },
        label,
      ).map((x) => x.id),
    ).toEqual(["match"]);
    expect(
      filterRackItems(
        items,
        { ...DEFAULT_RACK_FILTERS, wash: "clean" },
        label,
      ).map((x) => x.id),
    ).toEqual(["clean"]);
  });
  it("searches normalized names, brands, styles, materials and colors", () => {
    const value = item("name", {
      name: "ＣＩＴＹ",
      brand: "Straße",
      primary_color: "navy",
      tags: {
        colors: ["cream"],
        style: ["vintage"],
        season: [],
        material: "cotton",
      },
    });
    for (const query of [
      " city ",
      "STRASSE",
      "vintage",
      "cotton",
      "navy",
      "cream",
      "宽松衬衫",
    ]) {
      expect(
        filterRackItems([value], { ...DEFAULT_RACK_FILTERS, query }, label),
      ).toEqual([value]);
    }
  });
  it("sorts newest and least worn with deterministic ties and no source mutation", () => {
    const values = [
      item("older", { created_at: "2025-01-01", wear_count: 9 }),
      item("newer", { created_at: "2026-01-01", wear_count: 2 }),
      item("tie", { created_at: "2026-01-01", wear_count: 2 }),
      item("invalid", { created_at: "invalid", wear_count: Number.NaN }),
    ];
    expect(
      filterRackItems(values, DEFAULT_RACK_FILTERS, label).map((x) => x.id),
    ).toEqual(["newer", "tie", "older", "invalid"]);
    expect(
      filterRackItems(
        values,
        { ...DEFAULT_RACK_FILTERS, sort: "leastWorn" },
        label,
      ).map((x) => x.id),
    ).toEqual(["invalid", "newer", "tie", "older"]);
    expect(values[0].id).toBe("older");
  });
  it("sorts colors together using the actual safe swatches", () => {
    const values = [
      item("white", { primary_color: "white" }),
      item("black", { primary_color: "black" }),
      item("black-2", { primary_color: "black" }),
    ];
    expect(
      filterRackItems(
        values,
        { ...DEFAULT_RACK_FILTERS, sort: "color" },
        label,
      ).map((x) => x.id),
    ).toEqual(["black", "black-2", "white"]);
  });
});

describe("safe wardrobe swatches", () => {
  it("normalizes known aliases, falls back through tag colors, and never returns a CSS variable", () => {
    expect(rackItemColor(item("alias", { primary_color: "Light Blue" }))).toBe(
      colorSwatch("light-blue"),
    );
    expect(
      rackItemColor(
        item("fallback", {
          primary_color: "unknown",
          tags: { primary_color: "navy", colors: [], style: [], season: [] },
        }),
      ),
    ).toBe(colorSwatch("navy"));
    expect(
      rackItemColor(
        item("neutral", { primary_color: "var(--bad)", colors: ["imaginary"] }),
      ),
    ).toBe("#c1beb6");
  });
});

describe("bounded 3D display window", () => {
  const values = Array.from({ length: 15 }, (_, index) => item(String(index)));
  it("centers a selected item and clamps the first/last windows without losing the selection", () => {
    expect(rackWindow(values, "7").map((x) => x.id)).toEqual([
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
    expect(rackWindow(values, "14").map((x) => x.id)).toEqual([
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
    ]);
    expect(rackWindow(values, "0").map((x) => x.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });
  it("shows the first window for no/unknown selection, all short lists and no items for a nonpositive limit", () => {
    expect(rackWindow(values, null)).toEqual(values.slice(0, 7));
    expect(rackWindow(values, "missing", 3)).toEqual(values.slice(0, 3));
    expect(rackWindow(values.slice(0, 4), "3")).toEqual(values.slice(0, 4));
    expect(rackWindow(values, "3", 0)).toEqual([]);
    expect(rackWindow([], null)).toEqual([]);
  });
});
