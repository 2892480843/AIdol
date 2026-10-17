import {
  CLOTHING_COLORS,
  CLOTHING_TYPE_VALUES,
  COLOR_ALIASES,
} from "@/lib/generated/garment-vocabulary";
import type { Item } from "@/lib/types";

export type FormulaSlot = {
  id: string;
  types: string[];
  color?: "neutral" | "accent" | "same-as-first";
  optional?: boolean;
};
export type OutfitFormula = {
  id: string;
  occasion: string;
  slots: FormulaSlot[];
};
export type FormulaMatch = {
  slots: {
    slot: FormulaSlot;
    item: Item | null;
    candidates: Item[];
    colorSatisfied: boolean | null;
  }[];
  matched: number;
  required: number;
  complete: boolean;
};
const knownTypes = new Set<string>(CLOTHING_TYPE_VALUES);
const knownColors = new Set<string>(
  CLOTHING_COLORS.map((color) => color.value),
);
const neutrals = new Set([
  "black",
  "white",
  "gray",
  "navy",
  "brown",
  "tan",
  "beige",
  "cream",
  "silver",
]);

export function isInspirationItemEligible(item: Item): boolean {
  return (
    item.status === "ready" &&
    !item.is_archived &&
    !item.needs_wash &&
    knownTypes.has(item.type)
  );
}
function colorOf(item: Item | null): string | null {
  const value = (
    item?.primary_color ||
    item?.tags?.primary_color ||
    item?.colors?.[0] ||
    ""
  )
    .trim()
    .toLowerCase();
  const canonical = COLOR_ALIASES[value] || value;
  return knownColors.has(canonical) ? canonical : null;
}
function colorSatisfied(
  slot: FormulaSlot,
  item: Item | null,
  first: Item | null,
): boolean | null {
  if (!slot.color) return null;
  const color = colorOf(item);
  if (!color) return null;
  if (slot.color === "neutral") return neutrals.has(color);
  if (slot.color === "accent") return !neutrals.has(color);
  const reference = colorOf(first);
  return reference ? reference === color : null;
}
function wearCount(item: Item): number {
  return Number.isFinite(item.wear_count) ? Math.max(0, item.wear_count) : 0;
}

/** Category coverage only. Color is a soft tie-break, never an aesthetic score. */
export function matchFormula(
  formula: OutfitFormula,
  items: Item[],
  overrides: Record<string, string> = {},
): FormulaMatch {
  const unique = new Map<string, Item>();
  for (const item of items) {
    if (isInspirationItemEligible(item) && !unique.has(item.id))
      unique.set(item.id, item);
  }
  const selected = new Map<number, Item>();
  const owners = new Map<string, number>();
  const locked = new Set<number>();
  const baseCandidates = formula.slots.map((slot) =>
    Array.from(unique.values()).filter((item) =>
      slot.types.includes(item.type),
    ),
  );
  // Reserve manual choices first so an earlier automatic slot cannot steal them.
  formula.slots.forEach((slot, index) => {
    const item = unique.get(overrides[slot.id]);
    if (item && slot.types.includes(item.type) && !owners.has(item.id)) {
      selected.set(index, item);
      owners.set(item.id, index);
      locked.add(index);
    }
  });
  const sortCandidates = (index: number, first: Item | null) =>
    [...baseCandidates[index]].sort(
      (a, b) =>
        wearCount(a) - wearCount(b) ||
        Number(colorSatisfied(formula.slots[index], b, first) === true) -
          Number(colorSatisfied(formula.slots[index], a, first) === true) ||
        a.id.localeCompare(b.id),
    );
  // A small augmenting-path match prevents broad slots from hiding a valid
  // combination when a later, narrower category needs the same garment.
  const assign = (index: number, seen: Set<string>): boolean => {
    for (const item of sortCandidates(index, selected.get(0) ?? null)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const previous = owners.get(item.id);
      if (
        previous === undefined ||
        (!locked.has(previous) && assign(previous, seen))
      ) {
        selected.set(index, item);
        owners.set(item.id, index);
        return true;
      }
    }
    return false;
  };
  const ordered = formula.slots
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Number(!!formula.slots[a].optional) -
        Number(!!formula.slots[b].optional),
    );
  for (const index of ordered)
    if (!selected.has(index)) assign(index, new Set());
  const first = selected.get(0) ?? null;
  const slots = formula.slots.map((slot, index) => ({
    slot,
    item: selected.get(index) ?? null,
    candidates: sortCandidates(index, first).filter(
      (item) => !owners.has(item.id) || owners.get(item.id) === index,
    ),
    colorSatisfied: colorSatisfied(slot, selected.get(index) ?? null, first),
  }));
  const required = slots.filter(({ slot }) => !slot.optional).length;
  const matched = slots.filter(
    ({ slot, item }) => !slot.optional && item !== null,
  ).length;
  return { slots, matched, required, complete: matched === required };
}
