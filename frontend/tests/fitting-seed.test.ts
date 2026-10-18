import { describe, it, expect } from "vitest";
import { fittingRoomHref, parseFittingSeed } from "@/lib/fitting-seed";
import type { Item } from "@/lib/types";
const item = (n: number, type: string) =>
  ({
    id: `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`,
    type,
    status: "ready",
    is_archived: false,
    needs_wash: false,
  }) as Item;
describe("fitting room deep links", () => {
  it("passes actual item identifiers without embedding photos or signed URLs", () => {
    const top = item(1, "t-shirt");
    expect(fittingRoomHref([top])).toBe(
      `/dashboard/wardrobe/tryon?items=${top.id}`,
    );
  });
  it("accepts four complementary slots and dress with outerwear", () => {
    expect(
      fittingRoomHref([
        item(1, "t-shirt"),
        item(2, "pants"),
        item(3, "coat"),
        item(4, "sneakers"),
      ]),
    ).not.toBeNull();
    expect(fittingRoomHref([item(1, "dress"), item(2, "coat")])).not.toBeNull();
  });
  it("rejects conflicting groups, unknown types, dirty and malformed references", () => {
    for (const items of [
      [item(1, "dress"), item(2, "pants")],
      [item(1, "pants"), item(2, "jeans")],
      [item(1, "suit")],
      [{ ...item(1, "dress"), needs_wash: true }],
      [{ ...item(1, "dress"), id: "invalid" }],
    ])
      expect(fittingRoomHref(items)).toBeNull();
  });
  it("rejects empty, duplicate, excess or array query values rather than silently omitting references", () => {
    for (const query of [
      "",
      item(1, "dress").id + "," + item(1, "dress").id,
      [item(1, "dress").id],
      Array.from({ length: 5 }, (_, i) => item(i, "coat").id).join(","),
      "invalid",
    ])
      expect(parseFittingSeed(query)).toEqual([]);
  });
});
