import type { ReactNode } from "react";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { useWardrobe3D } from "@/lib/hooks/use-wardrobe-3d";

const item = (id: string, extra: object = {}) => ({
  id,
  user_id: "owner-a",
  type: "shirt",
  status: "ready",
  is_archived: false,
  needs_wash: false,
  ...extra,
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
  setActiveSession("owner-a", "token-a");
  client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
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

describe("3D wardrobe inventory", () => {
  it("loads 100 ready garments per page including laundry/unknown types, deduplicates and never shares items cache shape", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          page(
            [
              item("one", { needs_wash: true }),
              item("other", { type: "unknown" }),
              item("busy", { status: "processing" }),
              item("archive", { is_archived: true }),
              item("foreign", { user_id: "owner-b" }),
            ],
            1,
            true,
            142,
          ),
        ),
      )
      .mockResolvedValueOnce(
        response(
          page([item("one", { needs_wash: true }), item("two")], 2, false, 142),
        ),
      );
    const { result } = renderHook(useWardrobe3D, { wrapper });
    await waitFor(() =>
      expect(result.current.items.map((x) => x.id)).toEqual(["one", "other"]),
    );
    expect(result.current.owner).toBe("owner-a");
    expect(result.current.total).toBe(142);
    expect(result.current.hasMore).toBe(true);
    const params = new URL(String(fetchMock.mock.calls[0][0]), "http://test")
      .searchParams;
    expect(Object.fromEntries(params)).toMatchObject({
      page: "1",
      page_size: "100",
      status: "ready",
      is_archived: "false",
    });
    expect(params.has("needs_wash")).toBe(false);
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() =>
      expect(result.current.items.map((x) => x.id)).toEqual([
        "one",
        "other",
        "two",
      ]),
    );
    expect(result.current.hasMore).toBe(false);
    expect(client.getQueriesData({ queryKey: ["items"] })).toEqual([]);
  });
  it("refreshes on remount and focus despite long lived application query defaults", async () => {
    fetchMock
      .mockResolvedValueOnce(response(page([item("first")])))
      .mockResolvedValueOnce(response(page([item("second")])))
      .mockResolvedValueOnce(response(page([item("third")])));
    const first = renderHook(useWardrobe3D, { wrapper });
    await waitFor(() =>
      expect(first.result.current.items[0]?.id).toBe("first"),
    );
    first.unmount();
    const second = renderHook(useWardrobe3D, { wrapper });
    await waitFor(() =>
      expect(second.result.current.items[0]?.id).toBe("second"),
    );
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() =>
      expect(second.result.current.items[0]?.id).toBe("third"),
    );
  });
  it("aborts an old account request and refuses its stale loadMore/refetch callbacks", async () => {
    let finish!: (value: Response) => void;
    fetchMock
      .mockResolvedValueOnce(response(page([item("a")], 1, true, 130)))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(
        response(page([item("b", { user_id: "owner-b" })])),
      );
    const { result } = renderHook(useWardrobe3D, { wrapper });
    await waitFor(() => expect(result.current.items[0]?.id).toBe("a"));
    const staleLoad = result.current.loadMore;
    const staleRefetch = result.current.refetch;
    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    act(() => setActiveSession("owner-b", "token-b"));
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => {
      finish(response(page([item("late-a")], 2)));
      await staleLoad();
      await staleRefetch();
    });
    await waitFor(() =>
      expect(result.current.items.map((x) => x.id)).toEqual(["b"]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe(
      "Bearer token-b",
    );
  });
  it("keeps already loaded inventory when another page fails and retries explicitly", async () => {
    fetchMock
      .mockResolvedValueOnce(response(page([item("one")], 1, true, 120)))
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce(response(page([item("two")], 2, false, 120)));
    const { result } = renderHook(useWardrobe3D, { wrapper });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.items[0].id).toBe("one");
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });
    await waitFor(() =>
      expect(result.current.items.map((x) => x.id)).toEqual(["one", "two"]),
    );
  });
  it("does not send requests or expose inventory without an active account", async () => {
    setActiveSession(null, null);
    const { result } = renderHook(useWardrobe3D, { wrapper });
    await act(async () => {
      await result.current.loadMore();
      await result.current.refetch();
    });
    expect(result.current.items).toEqual([]);
    expect(result.current.owner).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
