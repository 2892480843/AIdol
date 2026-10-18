import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { queryKeys } from "@/lib/hooks/query-keys";
import {
  useWardrobeDraft,
  useWardrobeDraftItems,
} from "@/lib/hooks/use-wardrobe-draft";
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const key = (owner = "owner-a") =>
  `wardrobe_draft_v1:${encodeURIComponent(owner)}`;
const payload = (ids: string[]) => JSON.stringify({ version: 1, ids });
const item = (value: number, extra: object = {}) => ({
  id: id(value),
  user_id: "owner-a",
  type: "shirt",
  status: "ready",
  is_archived: false,
  needs_wash: false,
  ...extra,
});
const response = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  localStorage.clear();
  setActiveSession("owner-a", "token-a");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn().mockResolvedValue(response(item(1)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  await act(async () => {
    client.clear();
    setActiveSession(null, null);
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("account scoped persistent wardrobe draft", () => {
  it("restores on mount without an initial empty write, then persists only version and IDs across remount", async () => {
    localStorage.setItem(key(), payload([id(1)]));
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const first = renderHook(useWardrobeDraft);
    await waitFor(() => expect(first.result.current.hydrated).toBe(true));
    expect(first.result.current.ids).toEqual([id(1)]);
    expect(writes).not.toHaveBeenCalled();
    act(() => first.result.current.toggle(id(2)));
    expect(JSON.parse(localStorage.getItem(key())!)).toEqual({
      version: 1,
      ids: [id(1), id(2)],
    });
    first.unmount();
    const second = renderHook(useWardrobeDraft);
    await waitFor(() =>
      expect(second.result.current.ids).toEqual([id(1), id(2)]),
    );
    act(() => second.result.current.remove(id(1)));
    expect(second.result.current.ids).toEqual([id(2)]);
    act(() => second.result.current.clear());
    expect(localStorage.getItem(key())).toBe(payload([]));
  });
  it("keeps six unique valid IDs and toggles an existing selection off", () => {
    const { result } = renderHook(useWardrobeDraft);
    act(() => {
      for (let i = 1; i <= 8; i++) result.current.toggle(id(i));
      result.current.toggle("invalid");
    });
    expect(result.current.ids).toEqual([1, 2, 3, 4, 5, 6].map(id));
    act(() => result.current.toggle(id(3)));
    expect(result.current.ids).toEqual([1, 2, 4, 5, 6].map(id));
  });
  it("restores each account independently and blocks old callbacks even across batched A to null to A", async () => {
    localStorage.setItem(key(), payload([id(1)]));
    localStorage.setItem(key("owner-b"), payload([id(2)]));
    const { result } = renderHook(useWardrobeDraft);
    const oldToggle = result.current.toggle;
    const oldRemove = result.current.remove;
    const oldClear = result.current.clear;
    act(() => setActiveSession("owner-b", "token-b"));
    await waitFor(() => expect(result.current.ids).toEqual([id(2)]));
    act(() => {
      oldToggle(id(3));
      oldClear();
      oldRemove(id(1));
    });
    expect(localStorage.getItem(key())).toBe(payload([id(1)]));
    expect(localStorage.getItem(key("owner-b"))).toBe(payload([id(2)]));
    act(() => setActiveSession("owner-a", "token-a"));
    await waitFor(() => expect(result.current.ids).toEqual([id(1)]));
    const beforeBounce = {
      toggle: result.current.toggle,
      remove: result.current.remove,
      clear: result.current.clear,
    };
    act(() => {
      setActiveSession(null, null);
      setActiveSession("owner-a", "token-new");
      beforeBounce.toggle(id(4));
      beforeBounce.remove(id(1));
      beforeBounce.clear();
    });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.ids).toEqual([id(1)]);
  });
  it("synchronizes two mounted instances without overwriting sequential choices", () => {
    const a = renderHook(useWardrobeDraft);
    const b = renderHook(useWardrobeDraft);
    act(() => {
      a.result.current.toggle(id(1));
      b.result.current.toggle(id(2));
    });
    expect(a.result.current.ids).toEqual([id(1), id(2)]);
    expect(b.result.current.ids).toEqual([id(1), id(2)]);
    act(() => a.result.current.clear());
    expect(b.result.current.ids).toEqual([]);
  });
  it("handles current account storage events and storage clears, ignoring unrelated keys", () => {
    const { result } = renderHook(useWardrobeDraft);
    act(() => {
      localStorage.setItem(key(), payload([id(3)]));
      window.dispatchEvent(
        new StorageEvent("storage", { key: key(), storageArea: localStorage }),
      );
    });
    expect(result.current.ids).toEqual([id(3)]);
    act(() => {
      localStorage.setItem(key(), payload([id(4)]));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: key("owner-b"),
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current.ids).toEqual([id(3)]);
    act(() => {
      localStorage.clear();
      window.dispatchEvent(
        new StorageEvent("storage", { key: null, storageArea: localStorage }),
      );
    });
    expect(result.current.ids).toEqual([]);
  });
  it("preserves in memory choices when writes fail and saves them when storage recovers", () => {
    const { result } = renderHook(useWardrobeDraft);
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Quota", "QuotaExceededError");
      });
    act(() => {
      result.current.toggle(id(1));
      result.current.toggle(id(2));
    });
    expect(result.current.ids).toEqual([id(1), id(2)]);
    expect(result.current.storageAvailable).toBe(false);
    act(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: key() })),
    );
    expect(result.current.ids).toEqual([id(1), id(2)]);
    write.mockRestore();
    act(() => result.current.toggle(id(3)));
    expect(result.current.storageAvailable).toBe(true);
    expect(localStorage.getItem(key())).toBe(payload([id(1), id(2), id(3)]));
  });
  it("does not overwrite corrupt storage on hydration and preserves valid memory after a corrupt external update", () => {
    localStorage.setItem(key(), "{bad");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(useWardrobeDraft);
    expect(result.current.hydrated).toBe(true);
    expect(result.current.storageAvailable).toBe(false);
    expect(write).not.toHaveBeenCalled();
    act(() => result.current.toggle(id(1)));
    expect(result.current.storageAvailable).toBe(true);
    act(() => {
      localStorage.setItem(key(), "bad");
      window.dispatchEvent(new StorageEvent("storage", { key: key() }));
    });
    expect(result.current.ids).toEqual([id(1)]);
    expect(result.current.storageAvailable).toBe(false);
  });
  it("stays usable when storage access is denied and blocks detached callbacks", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Denied", "SecurityError");
    });
    const view = renderHook(useWardrobeDraft);
    act(() => view.result.current.toggle(id(1)));
    expect(view.result.current.ids).toEqual([id(1)]);
    expect(view.result.current.storageAvailable).toBe(false);
    const detached = view.result.current.toggle;
    view.unmount();
    const writes = vi.mocked(Storage.prototype.setItem).mock.calls.length;
    act(() => detached(id(2)));
    expect(vi.mocked(Storage.prototype.setItem).mock.calls.length).toBe(writes);
  });
});

describe("saved wardrobe item resolution", () => {
  it("preserves loading slots while the current account token is unavailable and resumes when it returns", async () => {
    setActiveSession("owner-a", null);
    const { result } = renderHook(
      () => useWardrobeDraftItems("owner-a", [id(1)]),
      { wrapper },
    );
    expect(result.current.entries).toEqual([
      { id: id(1), item: null, state: "loading" },
    ]);
    expect(result.current.isLoading).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => setActiveSession("owner-a", "refreshed-token"));
    await waitFor(() => expect(result.current.entries[0]?.state).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("restores authoritative items beyond loaded inventory pages with a six ID limit and keeps dirty items visible", async () => {
    fetchMock.mockImplementation((url: string) => {
      const n = Number(url.split("/").at(-1)?.slice(-2));
      return Promise.resolve(response(item(n, { needs_wash: n === 1 })));
    });
    const { result } = renderHook(
      () => useWardrobeDraftItems("owner-a", [1, 2, 3, 4, 5, 6, 7].map(id)),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.entries.every((x) => x.state === "ready")).toBe(
        true,
      ),
    );
    expect(result.current.entries.map((x) => x.id)).toEqual(
      [1, 2, 3, 4, 5, 6].map(id),
    );
    expect(result.current.entries[0].item?.needs_wash).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(client.getQueryData(queryKeys.item(id(6)))).toMatchObject({
      id: id(6),
      user_id: "owner-a",
    });
  });
  it("keeps unavailable and error entries instead of dropping IDs, then allows explicit network retry", async () => {
    let networkFailed = true;
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith(id(1))) return Promise.resolve(response({}, 404));
      if (url.endsWith(id(2)))
        return Promise.resolve(response(item(2, { is_archived: true })));
      if (url.endsWith(id(3)))
        return Promise.resolve(response(item(3, { user_id: "owner-b" })));
      if (networkFailed) return Promise.reject(new Error("Offline"));
      return Promise.resolve(response(item(4)));
    });
    const { result } = renderHook(
      () => useWardrobeDraftItems("owner-a", [1, 2, 3, 4].map(id)),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.entries.map((x) => x.state)).toEqual([
        "unavailable",
        "unavailable",
        "unavailable",
        "error",
      ]),
    );
    expect(result.current.hasErrors).toBe(true);
    expect(result.current.entries.map((x) => x.id)).toEqual(
      [1, 2, 3, 4].map(id),
    );
    networkFailed = false;
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.entries[3].state).toBe("ready"));
  });
  it("never exposes the wrong owner's cached item and never treats revalidation as a completed draft", async () => {
    client.setQueryData(queryKeys.item(id(1)), item(1, { user_id: "owner-b" }));
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(
      () => useWardrobeDraftItems("owner-a", [id(1)]),
      { wrapper },
    );
    expect(result.current.entries[0].item).toBeNull();
    expect(result.current.entries[0].state).toBe("loading");
    await act(async () => finish(response(item(1))));
    await waitFor(() => expect(result.current.entries[0].state).toBe("ready"));
    expect(result.current.entries[0].item?.user_id).toBe("owner-a");
  });
  it("discards late results from the prior account and fences stale retry callbacks", async () => {
    let finish!: (value: Response) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(response(item(2, { user_id: "owner-b" })));
    const { result, rerender } = renderHook(
      ({ owner, ids }) => useWardrobeDraftItems(owner, ids),
      { wrapper, initialProps: { owner: "owner-a", ids: [id(1)] } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const staleRetry = result.current.retry;
    act(() => setActiveSession("owner-b", "token-b"));
    rerender({ owner: "owner-b", ids: [id(2)] });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      finish(response(item(1)));
      await staleRetry();
    });
    await waitFor(() => expect(result.current.entries[0].state).toBe("ready"));
    expect(result.current.entries[0].item?.user_id).toBe("owner-b");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("ignores mismatched returned IDs and does not query empty or unauthenticated drafts", async () => {
    fetchMock.mockResolvedValueOnce(response(item(2)));
    const first = renderHook(() => useWardrobeDraftItems("owner-a", [id(1)]), {
      wrapper,
    });
    await waitFor(() =>
      expect(first.result.current.entries[0].state).toBe("unavailable"),
    );
    first.unmount();
    fetchMock.mockClear();
    setActiveSession(null, null);
    const second = renderHook(() => useWardrobeDraftItems(null, []), {
      wrapper,
    });
    await act(async () => {
      await second.result.current.retry();
    });
    expect(second.result.current.entries).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
