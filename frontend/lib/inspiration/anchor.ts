import type { Item } from "@/lib/types";
import {
  isInspirationItemEligible,
  matchFormula,
  type FormulaMatch,
  type OutfitFormula,
} from "./matching";

export type AnchoredFormulaMatch = {
  match: FormulaMatch;
  anchorSlotId: string | null;
  compatible: boolean;
};

/** The caller supplies its current owner's loaded inventory; this checks category
 * and availability, while exact ownership is revalidated by the Studio entry. */
export function matchFormulaWithAnchor(
  formula: OutfitFormula,
  items: Item[],
  anchorId: string | null,
  overrides: Record<string, string> = {},
  skippedOptionalSlots: ReadonlySet<string> = new Set(),
): AnchoredFormulaMatch {
  const ordinary = () =>
    matchFormula(formula, items, overrides, skippedOptionalSlots);
  if (anchorId === null) {
    return { match: ordinary(), anchorSlotId: null, compatible: true };
  }
  const anchor = items.find(
    (item) => item.id === anchorId && isInspirationItemEligible(item),
  );
  if (!anchor) {
    return { match: ordinary(), anchorSlotId: null, compatible: false };
  }

  // A previous manual choice in another slot must not reserve the same item
  // before the anchored slot. Other manual choices stay intact.
  const otherOverrides: Record<string, string> = {};
  for (const [slotId, itemId] of Object.entries(overrides)) {
    if (itemId !== anchorId) otherOverrides[slotId] = itemId;
  }
  let best: { match: FormulaMatch; index: number } | null = null;
  for (let index = 0; index < formula.slots.length; index += 1) {
    const slot = formula.slots[index];
    if (!slot.types.includes(anchor.type)) continue;
    const skipped = new Set(skippedOptionalSlots);
    if (slot.optional) skipped.delete(slot.id);
    const match = matchFormula(
      formula,
      items,
      { ...otherOverrides, [slot.id]: anchorId },
      skipped,
    );
    if (match.slots[index].item?.id !== anchorId) continue;
    if (
      !best ||
      match.matched > best.match.matched ||
      (match.matched === best.match.matched &&
        !slot.optional &&
        !!formula.slots[best.index].optional)
    ) {
      best = { match, index };
    }
  }
  // Declaration order wins remaining ties; coverage is category coverage only.
  if (best !== null) {
    return {
      match: best.match,
      anchorSlotId: formula.slots[best.index].id,
      compatible: true,
    };
  }
  return { match: ordinary(), anchorSlotId: null, compatible: false };
}
