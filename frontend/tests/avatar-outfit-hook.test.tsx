import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { queryKeys } from "@/lib/hooks/query-keys";
import { useSaveAvatarOutfit } from "@/lib/hooks/use-avatar-outfit";
import type { Item } from "@/lib/types";

const id = "11111111-1111-4111-8111-111111111111";
const input = (extra: object = {}) => ({
  items: [
    {
      id,
      type: "shirt",
      user_id: "owner-a",
      status: "ready",
      is_archived: false,
      needs_wash: false,
    } as Item,
  ],
  name: "  周末造型  ",
  scheduledFor: "2026-10-18",
  ...extra,
});
const response = (body: unknown) =>
  ({ ok: true, status: 201, json: async () => body }) as Response;
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  setActiveSession("owner-a", "token-a");
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  fetchMock = vi
    .fn()
    .mockResolvedValue(response({ id: "saved-outfit", name: "周末造型" }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  client.clear();
  act(() => setActiveSession(null, null));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("explicit owner-scoped avatar outfit saving", () => {
  it("does not write on mount and posts a dated unworn outfit only once on explicit save", async () => {
    const invalidations = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(useSaveAvatarOutfit, { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      expect(await result.current.save(input())).toMatchObject({
        id: "saved-outfit",
      });
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/outfits/studio");
    expect(options.headers.Authorization).toBe("Bearer token-a");
    expect(JSON.parse(options.body)).toEqual({
      items: [id],
      name: "周末造型",
      occasion: "casual",
      scheduled_for: "2026-10-18",
      mark_worn: false,
    });
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: queryKeys.outfits.all,
    });
    expect(invalidations).toHaveBeenCalledWith({
      queryKey: queryKeys.calendarOutfits.all,
    });
    expect(result.current.isSaving).toBe(false);
  });
  it.each([
    [input({ scheduledFor: "2026-02-30" }), "invalid-date"],
    [input({ name: "  " }), "invalid-name"],
    [input({ occasion: "unknown" }), "invalid-occasion"],
    [input({ items: [] }), "invalid-items"],
    [
      input({ items: [{ ...input().items[0], user_id: "owner-b" }] }),
      "invalid-items",
    ],
    [
      input({ items: [{ ...input().items[0], needs_wash: true }] }),
      "invalid-items",
    ],
  ])("rejects invalid payload without posting (%s)", async (payload, code) => {
    const { result } = renderHook(useSaveAvatarOutfit, { wrapper });
    await act(async () => {
      await expect(
        result.current.save(payload as ReturnType<typeof input>),
      ).rejects.toMatchObject({ code });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects a callback captured under an old account", async () => {
    const { result } = renderHook(useSaveAvatarOutfit, { wrapper });
    const stale = result.current.save;
    act(() => setActiveSession("owner-b", "token-b"));
    await act(async () => {
      await expect(stale(input())).rejects.toMatchObject({
        code: "session-changed",
      });
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["switch", "sign-out-and-return", "token-change"])(
    "aborts a request after %s and ignores its late success",
    async (boundary) => {
      let finish!: (value: Response) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      );
      const invalidations = vi.spyOn(client, "invalidateQueries");
      const { result } = renderHook(useSaveAvatarOutfit, { wrapper });
      let pending!: Promise<unknown>;
      act(() => {
        pending = result.current.save(input()).catch((error) => error);
      });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
      act(() => {
        if (boundary === "switch") setActiveSession("owner-b", "token-b");
        else if (boundary === "token-change")
          setActiveSession("owner-a", "new-token");
        else {
          setActiveSession(null, null);
          setActiveSession("owner-a", "token-a");
        }
      });
      expect(signal.aborted).toBe(true);
      await act(async () => {
        finish(response({ id: "old-outfit" }));
        expect(await pending).toMatchObject({ code: "session-changed" });
      });
      expect(invalidations).not.toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    },
  );
  it("rejects duplicate clicks while saving and aborts on unmount", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, unmount } = renderHook(useSaveAvatarOutfit, { wrapper });
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.save(input()).catch((error) => error);
    });
    await act(async () => {
      await expect(result.current.save(input())).rejects.toMatchObject({
        code: "busy",
      });
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    finish(response({ id: "old-outfit" }));
    expect(await pending).toMatchObject({ code: "session-changed" });
  });
  it("reports a bounded failure with no automatic retry and allows explicit retry", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: "private upstream details" }),
    });
    const { result } = renderHook(useSaveAvatarOutfit, { wrapper });
    await act(async () => {
      await expect(result.current.save(input())).rejects.toMatchObject({
        code: "save-failed",
      });
    });
    expect(result.current.error?.code).toBe("save-failed");
    expect(result.current.error?.message).not.toContain("private upstream");
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.save(input());
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });
});
