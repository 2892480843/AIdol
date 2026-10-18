import { describe, expect, it } from "vitest";
import { parseAvatarJournal, upsertAvatarLook } from "@/lib/avatar-journal";

const id = (n: number) =>
  `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const record = (n = 1) => ({
  id: id(n),
  name: n === 1 ? "Weekend" : `Weekend ${n}`,
  date: "2026-10-18",
  config: {},
  itemIds: [id(50)],
  favorite: true,
  createdAt: "2026-10-18T01:00:00.000Z",
});
describe("account-local 3D look journal", () => {
  it("reuses an exact saved scene without merging different scenes that share a name", () => {
    const first = upsertAvatarLook([], {
      ...record(),
      itemIds: [id(50), id(51)],
    });
    const duplicate = upsertAvatarLook(first, {
      ...record(2),
      name: "Weekend",
      itemIds: [id(51), id(50)],
      createdAt: "2026-10-18T02:00:00Z",
    });
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].id).toBe(id(1));
    expect(duplicate[0].createdAt).toBe(first[0].createdAt);
    const different = upsertAvatarLook(duplicate, {
      ...record(3),
      name: "Weekend",
      itemIds: [id(52)],
    });
    expect(different).toHaveLength(2);
    expect(different.map((look) => look.name)).toEqual(["Weekend", "Weekend"]);
  });
  it("accepts an absent journal without inventing saved looks", () => {
    expect(parseAvatarJournal(null)).toEqual({ entries: [], valid: true });
  });
  it("reads versioned entries and normalizes only the safe scene config", () => {
    const result = parseAvatarJournal(
      JSON.stringify({ version: 1, entries: [record()] }),
    );
    expect(result.valid).toBe(true);
    expect(result.entries[0]).toMatchObject({
      id: id(1),
      date: "2026-10-18",
      itemIds: [id(50)],
    });
    expect(result.entries[0].config.model).toBe("female");
  });
  it("flags malformed storage without displaying forged or impossible records", () => {
    for (const raw of [
      "broken",
      JSON.stringify({ version: 2, entries: [] }),
      JSON.stringify({
        version: 1,
        entries: [{ ...record(), date: "2026-02-31" }],
      }),
      JSON.stringify({
        version: 1,
        entries: [{ ...record(), itemIds: ["not-an-item"] }],
      }),
    ]) {
      expect(parseAvatarJournal(raw)).toEqual({ entries: [], valid: false });
    }
  });
  it("does not persist photos, external model URLs or unknown private metadata", () => {
    const result = parseAvatarJournal(
      JSON.stringify({
        version: 1,
        entries: [
          {
            ...record(),
            photo: "secret",
            config: {
              model: "female",
              url: "https://external.invalid/model.glb",
            },
          },
        ],
      }),
    );
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("external.invalid");
  });
  it("updates the same saved look and preserves unrelated looks", () => {
    const first = parseAvatarJournal(
      JSON.stringify({ version: 1, entries: [record(), record(2)] }),
    ).entries;
    const next = upsertAvatarLook(first, { ...first[0], favorite: false });
    expect(next).toHaveLength(2);
    expect(next.find((r) => r.id === id(1))?.favorite).toBe(false);
    expect(next.some((r) => r.id === id(2))).toBe(true);
  });
  it("bounds the journal and rejects an invalid explicit write", () => {
    let entries = parseAvatarJournal(null).entries;
    for (let n = 1; n <= 40; n++)
      entries = upsertAvatarLook(entries, record(n));
    expect(entries).toHaveLength(24);
    expect(entries[0].id).toBe(id(40));
    expect(() =>
      upsertAvatarLook(entries, { ...entries[0], date: "bad" }),
    ).toThrow();
  });
});

const thumbnail = "data:image/webp;base64,UklGRg==";
describe("bounded avatar thumbnails", () => {
  it("round-trips a bounded WebP thumbnail and keeps old metadata-only records", () => {
    const result = parseAvatarJournal(
      JSON.stringify({
        version: 1,
        entries: [{ ...record(), thumbnail }, record(2)],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.entries[0]).toHaveProperty("thumbnail", thumbnail);
    expect(result.entries[1]).not.toHaveProperty("thumbnail");
  });
  it("drops oversize, malformed, remote, SVG and alternate image thumbnails", () => {
    for (const unsafe of [
      "https://example.invalid/image.webp",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,aW1hZ2U=",
      "data:image/webp;base64,not base64",
      "data:image/webp;base64," + "A".repeat(24_000),
    ]) {
      const result = parseAvatarJournal(
        JSON.stringify({
          version: 1,
          entries: [{ ...record(), thumbnail: unsafe }],
        }),
      );
      expect(result.valid).toBe(true);
      expect(result.entries[0]).not.toHaveProperty("thumbnail");
      expect(
        upsertAvatarLook([], { ...record(), thumbnail: unsafe })[0],
      ).not.toHaveProperty("thumbnail");
    }
  });
  it("accepts 24 bounded thumbnails while refusing a journal above the raw limit", () => {
    const large = "data:image/webp;base64," + "A".repeat(23_976);
    const entries = Array.from({ length: 24 }, (_, n) => ({
      ...record(n + 1),
      thumbnail: large,
    }));
    const raw = JSON.stringify({ version: 1, entries });
    expect(raw.length).toBeGreaterThan(100_000);
    expect(parseAvatarJournal(raw).entries).toHaveLength(24);
    expect(parseAvatarJournal(" ".repeat(750_001)).valid).toBe(false);
  });
});
