import { describe, expect, it } from "vitest";
import {
  MAX_RACK_DRAFT_ITEMS,
  normalizeRackDraftIds,
  parseRackDraft,
} from "@/lib/wardrobe-draft";
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

describe("browser wardrobe draft format", () => {
  it("normalizes canonical UUIDs in order, removes duplicates and keeps at most six", () => {
    const ids = [
      "ABCDEF12-3456-4789-ABCD-0123456789AB",
      "abcdef12-3456-4789-abcd-0123456789ab",
      "not-an-id",
      null,
      ...Array.from({ length: 8 }, (_, i) => id(i)),
    ];
    const before = structuredClone(ids);
    expect(MAX_RACK_DRAFT_ITEMS).toBe(6);
    expect(normalizeRackDraftIds(ids)).toEqual([
      "abcdef12-3456-4789-abcd-0123456789ab",
      id(0),
      id(1),
      id(2),
      id(3),
      id(4),
    ]);
    expect(ids).toEqual(before);
  });
  it("does not interpret URLs, objects, or JSON strings as an ID list", () => {
    for (const value of [
      null,
      "[]",
      5,
      {},
      [{ id: id(1) }],
      ["https://example.org/private.jpg"],
    ])
      expect(normalizeRackDraftIds(value)).toEqual([]);
  });
  it("parses only version one and never carries stored image URLs or names into the draft", () => {
    expect(parseRackDraft(null)).toEqual({ ids: [], valid: true });
    expect(
      parseRackDraft(
        JSON.stringify({
          version: 1,
          ids: [id(1), id(1), "bad"],
          name: "Private name",
          image_url: "private.jpg",
        }),
      ),
    ).toEqual({ ids: [id(1)], valid: true });
  });
  it("rejects corrupt or unsupported payloads without throwing", () => {
    for (const value of [
      "{",
      "null",
      "[]",
      '{"version":2,"ids":[]}',
      '{"version":1,"ids":"bad"}',
      '{"ids":[]}',
    ])
      expect(parseRackDraft(value)).toEqual({ ids: [], valid: false });
  });
});
