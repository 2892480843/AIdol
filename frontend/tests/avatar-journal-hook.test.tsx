import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAvatarJournal } from "@/lib/hooks/use-avatar-journal";
import { DEFAULT_AVATAR_CONFIG } from "@/lib/avatar-studio";
const session = vi.hoisted(() => ({
  owner: "account-a" as string | null,
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/api", () => ({
  getActiveUserId: () => session.owner,
  subscribeActiveSession: (listener: () => void) => {
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  },
}));
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Saved",
  date: "2026-10-18",
  itemIds: [],
  favorite: true,
  dressMode: true,
  showOuterwear: false,
  config: DEFAULT_AVATAR_CONFIG,
  createdAt: "2026-10-18T01:00:00Z",
};
const key = (owner: string) => `dada_avatar_journal_v1:${owner}`;
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  session.owner = "account-a";
  session.listeners.clear();
});
describe("avatar journal storage boundaries", () => {
  it("does not write through callbacks retained after the journal unmounts", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    const save = h.result.current.save;
    const remove = h.result.current.remove;
    const write = vi.spyOn(Storage.prototype, "setItem");
    h.unmount();
    expect(() => save(row)).toThrow("Avatar journal not ready");
    expect(() => remove(row.id)).toThrow("Avatar journal not ready");
    expect(write).not.toHaveBeenCalled();
  });
  it("persists an exact repeated bookmark only once while preserving a genuinely different pose", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
      h.result.current.save({
        ...row,
        id: "22222222-2222-4222-8222-222222222222",
      });
    });
    expect(h.result.current.entries).toHaveLength(1);
    act(() => {
      h.result.current.save({
        ...row,
        id: "33333333-3333-4333-8333-333333333333",
        config: { ...row.config, pose: "editorial" },
      });
    });
    expect(h.result.current.entries).toHaveLength(2);
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries,
    ).toHaveLength(2);
  });
  it("deletes only the requested saved scene and preserves another tab's latest records", async () => {
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({ version: 1, entries: [row] }),
    );
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.entries).toHaveLength(1));
    const other = {
      ...row,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Other",
    };
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({ version: 1, entries: [row, other] }),
    );
    act(() => expect(h.result.current.remove(row.id)).toBe(true));
    expect(h.result.current.entries.map((entry) => entry.id)).toEqual([
      other.id,
    ]);
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries.map(
        (entry: { id: string }) => entry.id,
      ),
    ).toEqual([other.id]);
  });
  it("retains the saved scene when persisting its deletion fails", async () => {
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({ version: 1, entries: [row] }),
    );
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.entries).toHaveLength(1));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    act(() => expect(h.result.current.remove(row.id)).toBe(false));
    expect(h.result.current.entries).toHaveLength(1);
    expect(h.result.current.error).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries,
    ).toHaveLength(1);
  });
  it("rejects a deletion callback captured before account sign-out and return", async () => {
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({ version: 1, entries: [row] }),
    );
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    const stale = h.result.current.remove;
    act(() => {
      session.owner = null;
      session.listeners.forEach((listener) => listener());
      session.owner = "account-a";
      session.listeners.forEach((listener) => listener());
    });
    expect(() => stale(row.id)).toThrow("session-changed");
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries,
    ).toHaveLength(1);
  });
  it("hydrates saved settings without overwriting the stored account journal", async () => {
    const raw = JSON.stringify({ version: 1, entries: [row] });
    localStorage.setItem(key("account-a"), raw);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    expect(h.result.current.entries[0].name).toBe("Saved");
    expect(write).not.toHaveBeenCalled();
  });
  it("keeps pending choices in memory and reports a quota failure", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    act(() => expect(h.result.current.save(row)).toBe(false));
    expect(h.result.current.entries).toHaveLength(1);
    expect(h.result.current.error).toBe(true);
    expect(localStorage.getItem(key("account-a"))).toBeNull();
  });
  it("immediately hides one account's bookmarks when the session changes", async () => {
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({ version: 1, entries: [row] }),
    );
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.entries).toHaveLength(1));
    act(() => {
      session.owner = "account-b";
      session.listeners.forEach((fn) => fn());
    });
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    expect(h.result.current.entries).toEqual([]);
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries,
    ).toHaveLength(1);
    expect(localStorage.getItem(key("account-b"))).toBeNull();
  });
});

const thumbnail = "data:image/webp;base64,UklGRg==";
describe("avatar thumbnail attachment boundaries", () => {
  it("attaches to the matching normalized scene without replacing identity, creation time or favorite", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    act(() => {
      h.result.current.save({ ...row, favorite: false });
    });
    act(() =>
      expect(
        h.result.current.saveThumbnail(
          {
            ...row,
            id: "22222222-2222-4222-8222-222222222222",
            createdAt: "2026-10-18T02:00:00Z",
          },
          thumbnail,
        ),
      ).toBe(true),
    );
    expect(h.result.current.entries[0]).toMatchObject({
      id: row.id,
      createdAt: "2026-10-18T01:00:00.000Z",
      favorite: false,
      thumbnail,
    });
  });
  it("never recreates a scene deleted before capture finishes, including another tab's deletion", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    const finishCapture = h.result.current.saveThumbnail;
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({ version: 1, entries: [] }),
    );
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() => expect(finishCapture(row, thumbnail)).toBe(false));
    expect(write).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(key("account-a"))!).entries).toEqual(
      [],
    );
  });
  it("refuses image attachment while pending saves are dirty without losing those choices", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError");
      });
    act(() =>
      expect(h.result.current.save({ ...row, name: "Pending" })).toBe(false),
    );
    write.mockRestore();
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({ version: 1, entries: [] }),
    );
    act(() =>
      expect(h.result.current.saveThumbnail(row, thumbnail)).toBe(false),
    );
    expect(h.result.current.entries[0].name).toBe("Pending");
    expect(JSON.parse(localStorage.getItem(key("account-a"))!).entries).toEqual(
      [],
    );
  });
  it("preserves another tab's latest records when attaching a capture", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    const other = {
      ...row,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Other",
    };
    localStorage.setItem(
      key("account-a"),
      JSON.stringify({
        version: 1,
        entries: [{ ...row, favorite: false }, other],
      }),
    );
    act(() =>
      expect(h.result.current.saveThumbnail(row, thumbnail)).toBe(true),
    );
    expect(h.result.current.entries).toHaveLength(2);
    expect(h.result.current.entries[0]).toMatchObject({
      thumbnail,
      favorite: false,
    });
    expect(h.result.current.entries[1].id).toBe(other.id);
  });
  it("does not attach an old capture after a scene was modified under the same id", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    act(() => {
      h.result.current.save({
        ...row,
        config: { ...row.config, pose: "editorial" },
      });
    });
    act(() =>
      expect(h.result.current.saveThumbnail(row, thumbnail)).toBe(false),
    );
    expect(h.result.current.entries[0]).not.toHaveProperty("thumbnail");
  });
  it("rejects a delayed capture across account changes and sign-out/return epochs", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    const finishCapture = h.result.current.saveThumbnail;
    act(() => {
      session.owner = "account-b";
      session.listeners.forEach((listener) => listener());
    });
    expect(() => finishCapture(row, thumbnail)).toThrow("session-changed");
    expect(localStorage.getItem(key("account-b"))).toBeNull();
    act(() => {
      session.owner = "account-a";
      session.listeners.forEach((listener) => listener());
    });
    expect(() => finishCapture(row, thumbnail)).toThrow("session-changed");
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries[0],
    ).not.toHaveProperty("thumbnail");
  });
  it("rejects invalid thumbnails and callbacks retained after unmount", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    const finishCapture = h.result.current.saveThumbnail;
    const write = vi.spyOn(Storage.prototype, "setItem");
    act(() =>
      expect(finishCapture(row, "https://example.invalid/secret.webp")).toBe(
        false,
      ),
    );
    expect(write).not.toHaveBeenCalled();
    h.unmount();
    expect(() => finishCapture(row, thumbnail)).toThrow(
      "Avatar journal not ready",
    );
  });
  it("keeps the existing durable scene on thumbnail quota failure and recovers on retry", async () => {
    const h = renderHook(() => useAvatarJournal());
    await waitFor(() => expect(h.result.current.hydrated).toBe(true));
    act(() => {
      h.result.current.save(row);
    });
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota", "QuotaExceededError");
      });
    act(() =>
      expect(h.result.current.saveThumbnail(row, thumbnail)).toBe(false),
    );
    expect(h.result.current.error).toBe(true);
    expect(h.result.current.entries).toHaveLength(1);
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries[0],
    ).not.toHaveProperty("thumbnail");
    write.mockRestore();
    act(() =>
      expect(h.result.current.saveThumbnail(row, thumbnail)).toBe(true),
    );
    expect(h.result.current.error).toBe(false);
    expect(
      JSON.parse(localStorage.getItem(key("account-a"))!).entries[0].thumbnail,
    ).toBe(thumbnail);
  });
});
