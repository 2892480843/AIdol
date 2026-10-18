"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getActiveUserId, subscribeActiveSession } from "@/lib/api";
import type { OutfitFormula } from "@/lib/inspiration/matching";

type FormulaChoices = {
  overrides: Record<string, string>;
  skippedOptionalSlots: ReadonlySet<string>;
};
type ChoiceState = {
  owner: string | null;
  epoch: number;
  formulas: Map<string, FormulaChoices>;
};
const EMPTY_CHOICES: FormulaChoices = {
  overrides: {},
  skippedOptionalSlots: new Set(),
};

/** Ephemeral per-formula edits. An owner change discards every formula's item IDs. */
export function useInspirationChoices(formula: OutfitFormula) {
  const owner = useSyncExternalStore(
    subscribeActiveSession,
    getActiveUserId,
    () => null,
  );
  const [state, setState] = useState<ChoiceState>(() => ({
    owner,
    epoch: 0,
    formulas: new Map(),
  }));
  const current = useRef(state);
  useEffect(() => {
    const syncOwner = () => {
      const nextOwner = getActiveUserId();
      if (current.current.owner === nextOwner) return;
      current.current = {
        owner: nextOwner,
        epoch: current.current.epoch + 1,
        formulas: new Map(),
      };
      setState(current.current);
    };
    syncOwner();
    return subscribeActiveSession(syncOwner);
  }, []);

  const update = useCallback(
    (change: (choices: FormulaChoices) => FormulaChoices) => {
      const previous = current.current;
      // Epoch also fences a sign-out-and-return that React batches into one render.
      if (
        !owner ||
        getActiveUserId() !== owner ||
        previous.owner !== owner ||
        previous.epoch !== state.epoch
      )
        return;
      const choices = previous.formulas.get(formula.id) ?? EMPTY_CHOICES;
      const formulas = new Map(previous.formulas);
      formulas.set(formula.id, change(choices));
      current.current = { ...previous, formulas };
      setState(current.current);
    },
    [owner, state.epoch, formula.id],
  );

  const choose = useCallback(
    (slotId: string, itemId: string) => {
      if (!itemId || !formula.slots.some((slot) => slot.id === slotId)) return;
      update((choices) => {
        const skipped = new Set(choices.skippedOptionalSlots);
        skipped.delete(slotId);
        return {
          overrides: { ...choices.overrides, [slotId]: itemId },
          skippedOptionalSlots: skipped,
        };
      });
    },
    [formula.slots, update],
  );

  const toggleOptional = useCallback(
    (slotId: string) => {
      if (
        !formula.slots.some(
          (slot) => slot.id === slotId && slot.optional === true,
        )
      )
        return;
      update((choices) => {
        const skipped = new Set(choices.skippedOptionalSlots);
        if (skipped.has(slotId)) skipped.delete(slotId);
        else skipped.add(slotId);
        return { ...choices, skippedOptionalSlots: skipped };
      });
    },
    [formula.slots, update],
  );
  const reset = useCallback(() => update(() => EMPTY_CHOICES), [update]);
  const choices =
    owner && state.owner === owner
      ? (state.formulas.get(formula.id) ?? EMPTY_CHOICES)
      : EMPTY_CHOICES;
  return { ...choices, choose, toggleOptional, reset };
}
