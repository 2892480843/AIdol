import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setActiveSession } from "@/lib/api";
import { useInspirationChoices } from "@/lib/hooks/use-inspiration-choices";
import { matchFormula, type OutfitFormula } from "@/lib/inspiration/matching";
import { buildInspirationStudioUrl } from "@/lib/studio/inspiration-seed";
import type { Item } from "@/lib/types";

const everyday: OutfitFormula = {
  id: "everyday",
  occasion: "casual",
  slots: [
    { id: "top", types: ["shirt"] },
    { id: "bag", types: ["bag"], optional: true },
  ],
};
const layer: OutfitFormula = { ...everyday, id: "layer" };
beforeEach(() => setActiveSession("owner-a", "token-a"));
afterEach(() => act(() => setActiveSession(null, null)));

describe("formula-scoped inspiration choices", () => {
  it("keeps each formula choices while switching between them", () => {
    const { result, rerender } = renderHook(
      ({ formula }) => useInspirationChoices(formula),
      { initialProps: { formula: everyday } },
    );
    act(() => result.current.choose("top", "everyday-top"));
    act(() => result.current.toggleOptional("bag"));
    rerender({ formula: layer });
    expect(result.current.overrides).toEqual({});
    expect(Array.from(result.current.skippedOptionalSlots)).toEqual([]);
    act(() => result.current.choose("top", "layer-top"));
    rerender({ formula: everyday });
    expect(result.current.overrides).toEqual({ top: "everyday-top" });
    expect(Array.from(result.current.skippedOptionalSlots)).toEqual(["bag"]);
  });
  it("only skips known optional slots and choosing an item enables its slot again", () => {
    const { result } = renderHook(() => useInspirationChoices(everyday));
    act(() => {
      result.current.toggleOptional("top");
      result.current.toggleOptional("unknown");
      result.current.choose("unknown", "unusable");
    });
    expect(result.current.overrides).toEqual({});
    expect(Array.from(result.current.skippedOptionalSlots)).toEqual([]);
    act(() => result.current.choose("bag", "my-bag"));
    act(() => result.current.toggleOptional("bag"));
    expect(result.current.overrides).toEqual({ bag: "my-bag" });
    act(() => result.current.choose("bag", "other-bag"));
    expect(result.current.overrides).toEqual({ bag: "other-bag" });
    expect(Array.from(result.current.skippedOptionalSlots)).toEqual([]);
  });
  it("resets only the active formula, including skipped slots", () => {
    const { result, rerender } = renderHook(
      ({ formula }) => useInspirationChoices(formula),
      { initialProps: { formula: everyday } },
    );
    act(() => result.current.choose("top", "everyday-top"));
    rerender({ formula: layer });
    act(() => {
      result.current.choose("top", "layer-top");
      result.current.toggleOptional("bag");
      result.current.reset();
    });
    expect(result.current.overrides).toEqual({});
    expect(Array.from(result.current.skippedOptionalSlots)).toEqual([]);
    rerender({ formula: everyday });
    expect(result.current.overrides).toEqual({ top: "everyday-top" });
  });
  it.each(["switch", "sign-out-and-return"] as const)(
    "clears all formula choices and rejects stale callbacks after %s",
    (change) => {
      const { result, rerender } = renderHook(
        ({ formula }) => useInspirationChoices(formula),
        { initialProps: { formula: everyday } },
      );
      act(() => result.current.choose("top", "private-top"));
      const staleChoose = result.current.choose;
      rerender({ formula: layer });
      act(() => result.current.toggleOptional("bag"));
      act(() => {
        setActiveSession(
          change === "switch" ? "owner-b" : null,
          change === "switch" ? "token-b" : null,
        );
        setActiveSession("owner-a", "token-a");
      });
      act(() => staleChoose("top", "late-private-top"));
      expect(result.current.overrides).toEqual({});
      expect(Array.from(result.current.skippedOptionalSlots)).toEqual([]);
      rerender({ formula: everyday });
      expect(result.current.overrides).toEqual({});
    },
  );
  it("does not clear choices for an ordinary token rotation", () => {
    const { result } = renderHook(() => useInspirationChoices(everyday));
    act(() => result.current.choose("top", "my-top"));
    act(() => setActiveSession("owner-a", "rotated-token"));
    expect(result.current.overrides).toEqual({ top: "my-top" });
  });
  it("excludes skipped optional items from the Studio seed without changing required coverage", () => {
    const topId = "11111111-1111-4111-8111-111111111111";
    const bagId = "22222222-2222-4222-8222-222222222222";
    const items = [
      { id: topId, type: "shirt" },
      { id: bagId, type: "bag" },
    ].map(
      (item) =>
        ({
          ...item,
          status: "ready",
          is_archived: false,
          needs_wash: false,
          wear_count: 0,
        }) as Item,
    );
    const { result } = renderHook(() => useInspirationChoices(everyday));
    act(() => result.current.toggleOptional("bag"));
    const match = matchFormula(
      everyday,
      items,
      result.current.overrides,
      result.current.skippedOptionalSlots,
    );
    const selectedIds = match.slots.flatMap(({ item }) =>
      item ? [item.id] : [],
    );
    const url = new URL(
      buildInspirationStudioUrl(selectedIds, everyday.occasion, ""),
      "http://test",
    );
    expect(url.searchParams.get("seed")).toBe(topId);
    expect(match).toMatchObject({ matched: 1, required: 1, complete: true });
  });
});
