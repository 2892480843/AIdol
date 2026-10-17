import type { ReactNode } from "react";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { useInspirationWardrobe } from "@/lib/hooks/use-inspiration-wardrobe";
import { useSavedInspirations } from "@/lib/hooks/use-saved-inspirations";

const item = (id: string, user_id = "owner-a") => ({
  id,
  user_id,
  type: "shirt",
  status: "ready",
  is_archived: false,
  needs_wash: false,
  wear_count: 0,
});
const response = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
const page = (
  items: unknown[],
  index = 1,
  hasMore = false,
  total = items.length,
) => ({ items, page: index, page_size: 100, has_more: hasMore, total });
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  localStorage.clear();
  setActiveSession("owner-a", "token-a");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn().mockResolvedValue(response(page([])));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  client.clear();
  focusManager.setFocused(undefined);
  setActiveSession(null, null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("inspiration wardrobe pages", () => {
  it("refreshes on remount despite the app's long-lived query defaults", async () => {
    client.setDefaultOptions({
      queries: { retry: false, staleTime: Infinity },
    });
    fetchMock
      .mockResolvedValueOnce(response(page([item("before-archive")])))
      .mockResolvedValueOnce(response(page([item("new-upload")])));
    const first = renderHook(useInspirationWardrobe, { wrapper });
    await waitFor(() =>
      expect(first.result.current.items[0]?.id).toBe("before-archive"),
    );
    first.unmount();
    const next = renderHook(useInspirationWardrobe, { wrapper });
    await waitFor(() =>
      expect(next.result.current.items[0]?.id).toBe("new-upload"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(next.result.current.total).toBe(1);
  });
  it("refreshes on focus after changes outside the inspiration cache", async () => {
    client.setDefaultOptions({
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    });
    fetchMock
      .mockResolvedValueOnce(response(page([item("before-wash")])))
      .mockResolvedValueOnce(response(page([])));
    const { result } = renderHook(useInspirationWardrobe, { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.total).toBe(0);
  });
  it("loads 100 at a time, exposes the real total, and fetches further pages only explicitly", async () => {
    fetchMock
      .mockResolvedValueOnce(response(page([item("one")], 1, true, 142)))
      .mockResolvedValueOnce(
        response(page([item("one"), item("two")], 2, false, 142)),
      );
    const { result } = renderHook(useInspirationWardrobe, { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.total).toBe(142);
    expect(result.current.hasMore).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const params = new URL(String(fetchMock.mock.calls[0][0]), "http://test")
      .searchParams;
    expect(Object.fromEntries(params)).toMatchObject({
      page: "1",
      page_size: "100",
      status: "ready",
      is_archived: "false",
      needs_wash: "false",
    });
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() =>
      expect(result.current.items.map((i) => i.id)).toEqual(["one", "two"]),
    );
    expect(result.current.hasMore).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getQueriesData({ queryKey: ["items"] })).toHaveLength(0);
  });
  it("never shows another account cached pages or sends an old loadMore callback under the new account", async () => {
    fetchMock
      .mockResolvedValueOnce(response(page([item("a")], 1, true, 130)))
      .mockResolvedValueOnce(response(page([item("b", "owner-b")])));
    const { result } = renderHook(useInspirationWardrobe, { wrapper });
    await waitFor(() => expect(result.current.items[0]?.id).toBe("a"));
    const oldLoad = result.current.loadMore;
    act(() => setActiveSession("owner-b", "token-b"));
    expect(result.current.items.some((i) => i.user_id === "owner-a")).toBe(
      false,
    );
    await act(async () => {
      await oldLoad();
    });
    await waitFor(() => expect(result.current.items[0]?.id).toBe("b"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=1");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer token-b",
    );
  });
  it("aborts an account-switched pending request and discards its late result", async () => {
    let finish!: (response: Response) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(response(page([item("b", "owner-b")])));
    const { result } = renderHook(useInspirationWardrobe, { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    act(() => setActiveSession("owner-b", "token-b"));
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => finish(response(page([item("a")]))));
    await waitFor(() => expect(result.current.items[0]?.id).toBe("b"));
    expect(result.current.items.map((i) => i.id)).toEqual(["b"]);
  });
  it("keeps prior pages on load-more failure and allows an explicit retry", async () => {
    fetchMock
      .mockResolvedValueOnce(response(page([item("a")], 1, true, 110)))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(response(page([item("b")], 2, false, 110)));
    const { result } = renderHook(useInspirationWardrobe, { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));
  });
});

describe("account-scoped local inspiration saves", () => {
  it("preserves sequential saves from two mounted instances and synchronizes both", () => {
    const first = renderHook(useSavedInspirations);
    const second = renderHook(useSavedInspirations);
    act(() => first.result.current.toggle("everyday"));
    act(() => second.result.current.toggle("layer"));
    expect(
      JSON.parse(localStorage.getItem("inspiration_saved_v1:owner-a")!),
    ).toEqual({ version: 1, savedIds: ["everyday", "layer"] });
    expect(first.result.current.savedIds).toEqual(["everyday", "layer"]);
    expect(second.result.current.savedIds).toEqual(["everyday", "layer"]);
  });
  it("reads the latest validated storage before a toggle even before a storage event arrives", () => {
    const { result } = renderHook(useSavedInspirations);
    localStorage.setItem(
      "inspiration_saved_v1:owner-a",
      JSON.stringify({ version: 1, savedIds: ["everyday"] }),
    );
    act(() => result.current.toggle("layer"));
    expect(result.current.savedIds).toEqual(["everyday", "layer"]);
  });
  it("updates on native storage events only for the current owner, including removal", () => {
    const { result } = renderHook(useSavedInspirations);
    const key = "inspiration_saved_v1:owner-a";
    const newValue = JSON.stringify({ version: 1, savedIds: ["everyday"] });
    act(() => {
      localStorage.setItem(key, newValue);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current.savedIds).toEqual(["everyday"]);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "inspiration_saved_v1:owner-b",
          newValue: JSON.stringify({ version: 1, savedIds: ["other-owner"] }),
        }),
      );
    });
    expect(result.current.savedIds).toEqual(["everyday"]);
    act(() => {
      localStorage.removeItem(key);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key,
          newValue: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current.savedIds).toEqual([]);
  });
  it("persists a user selection across reload, isolates another account, and rejects stale callbacks", async () => {
    const first = renderHook(useSavedInspirations);
    act(() => first.result.current.toggle("linen-day"));
    expect(first.result.current.savedIds).toEqual(["linen-day"]);
    const staleToggle = first.result.current.toggle;
    first.unmount();
    const next = renderHook(useSavedInspirations);
    await waitFor(() =>
      expect(next.result.current.savedIds).toEqual(["linen-day"]),
    );
    act(() => setActiveSession("owner-b", "token-b"));
    expect(next.result.current.savedIds).toEqual([]);
    act(() => staleToggle("old-callback"));
    act(() => next.result.current.toggle("office-day"));
    expect(next.result.current.savedIds).toEqual(["office-day"]);
    act(() => setActiveSession("owner-a", "token-a"));
    await waitFor(() =>
      expect(next.result.current.savedIds).toEqual(["linen-day"]),
    );
  });
  it("handles unavailable storage without throwing or claiming durable persistence", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota");
    });
    const { result } = renderHook(useSavedInspirations);
    act(() => result.current.toggle("linen-day"));
    expect(result.current.savedIds).toEqual(["linen-day"]);
    expect(result.current.storageError).toBe(true);
    act(() => result.current.toggle("office-day"));
    expect(result.current.savedIds).toEqual(["linen-day", "office-day"]);
    expect(result.current.storageError).toBe(true);
  });
  it("rejects unvalidated storage and does not adopt legacy unowned saves", async () => {
    localStorage.setItem(
      "inspiration_saved_v1:owner-a",
      JSON.stringify({ version: 1, savedIds: ["good", 42] }),
    );
    localStorage.setItem("inspiration_saved", JSON.stringify(["legacy"]));
    const { result } = renderHook(useSavedInspirations);
    await waitFor(() => expect(result.current.storageError).toBe(true));
    expect(result.current.savedIds).toEqual([]);
    expect(localStorage.getItem("inspiration_saved")).toBe(
      JSON.stringify(["legacy"]),
    );
  });
  it("fails closed while signed out and validates formula IDs before saving", () => {
    setActiveSession(null, null);
    const { result } = renderHook(useSavedInspirations);
    act(() => result.current.toggle("linen-day"));
    expect(localStorage.length).toBe(0);
    expect(result.current.savedIds).toEqual([]);
    act(() => setActiveSession("owner-a", "token-a"));
    act(() => result.current.toggle("../invalid"));
    expect(result.current.savedIds).toEqual([]);
  });
});
