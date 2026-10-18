import type { Item } from "@/lib/types";
import { fittingGroupForType } from "@/lib/fitting-room";
import { normalizeRackDraftIds } from "@/lib/wardrobe-draft";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";
export function parseFittingSeed(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const parts = value.split(",");
  const ids = normalizeRackDraftIds(parts);
  return ids.length > 0 && ids.length <= 4 && ids.length === parts.length
    ? ids
    : [];
}
export function fittingRoomHref(items: Item[]): string | null {
  if (
    !items.length ||
    items.length > 4 ||
    items.some((item) => !isInspirationItemEligible(item))
  )
    return null;
  const groups = items.map((item) => fittingGroupForType(item.type));
  if (
    groups.some((group) => !group) ||
    new Set(groups).size !== groups.length ||
    (groups.includes("dresses") &&
      (groups.includes("tops") || groups.includes("bottoms")))
  )
    return null;
  const ids = parseFittingSeed(items.map((item) => item.id).join(","));
  return ids.length === items.length
    ? `/dashboard/wardrobe/tryon?items=${encodeURIComponent(ids.join(","))}`
    : null;
}
