import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import {
  buildInspirationStudioUrl,
  parseInspirationSeed,
  loadInspirationSeed,
} from "@/lib/studio/inspiration-seed";
const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const ready = (id: string, extra = {}) => ({
  id,
  user_id: "owner-a",
  type: "shirt",
  status: "ready",
  is_archived: false,
  needs_wash: false,
  ...extra,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  setActiveSession("owner-a", "token-a");
  fetchMock = vi
    .fn()
    .mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ready(url.split("/").pop()!),
    }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  setActiveSession(null, null);
  vi.unstubAllGlobals();
});
describe("inspiration studio seed", () => {
  it("round-trips a bounded deduplicated URL and encodes the name", () => {
    const url = buildInspirationStudioUrl(
      [first, first, second],
      "casual",
      "Linen & light",
    );
    expect(url.startsWith("/dashboard/outfits/new?")).toBe(true);
    expect(
      parseInspirationSeed(new URL(url, "http://test").searchParams),
    ).toEqual({
      itemIds: [first, second],
      occasion: "casual",
      name: "Linen & light",
    });
  });
  it.each(["", "not-a-uuid", `${first},bad`, Array(13).fill(first).join(",")])(
    "rejects malformed seed %s without fetching",
    (seed) => {
      expect(() =>
        parseInspirationSeed(new URLSearchParams({ seed, occasion: "casual" })),
      ).toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("rejects an unsupported occasion and returns null if no seed exists", () => {
    expect(() =>
      parseInspirationSeed(
        new URLSearchParams({ seed: first, occasion: "made-up" }),
      ),
    ).toThrow();
    expect(parseInspirationSeed(new URLSearchParams())).toBeNull();
  });
  it("retrieves exact owned items individually rather than relying on unsupported ids filtering", async () => {
    const items = await loadInspirationSeed(
      { itemIds: [second, first], occasion: "casual", name: "" },
      "owner-a",
    );
    expect(items.map((i) => i.id)).toEqual([second, first]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `/api/v1/items/${second}`,
      `/api/v1/items/${first}`,
    ]);
    expect(
      fetchMock.mock.calls.every(
        (call) => call[1].headers.Authorization === "Bearer token-a",
      ),
    ).toBe(true);
  });
  it.each([
    { user_id: "other" },
    { status: "processing" },
    { is_archived: true },
    { needs_wash: true },
    { id: second },
  ])(
    "rejects the whole seed when exact eligibility fails: %j",
    async (extra) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ready(first, extra),
      });
      await expect(
        loadInspirationSeed(
          { itemIds: [first], occasion: "casual", name: "" },
          "owner-a",
        ),
      ).rejects.toThrow();
    },
  );
  it("aborts on a session change and refuses a late response", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const result = loadInspirationSeed(
      { itemIds: [first], occasion: "casual", name: "" },
      "owner-a",
    );
    const rejected = expect(result).rejects.toThrow(/session/i);
    setActiveSession("owner-b", "token-b");
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    finish({
      ok: true,
      status: 200,
      json: async () => ready(first),
    } as Response);
    await rejected;
  });
});
