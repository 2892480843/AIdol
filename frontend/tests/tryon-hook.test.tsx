import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { useTryOn } from "@/lib/hooks/use-tryon";
import type { TryOnCapabilities, TryOnTask } from "@/lib/looks/tryon-types";
const id = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const cap: TryOnCapabilities = {
  configured: true,
  enabled: true,
  available: true,
  reason: null,
  provider: "seedream",
  model: "Doubao-seedream-4.5",
  accepted_mime_types: ["image/jpeg", "image/png", "image/webp"],
  max_person_image_bytes: 10485760,
  supported_categories: ["tops"],
  supported_item_types: ["shirt", "t-shirt"],
  max_items: 1,
  output: "image",
  poll_interval_ms: 3000,
};
const task: TryOnTask = {
  id: taskId,
  item_id: id,
  status: "succeeded",
  result_url: `/api/v1/tryon/tasks/${taskId}/image`,
  error_code: null,
  created_at: "2026-10-17T00:00:00Z",
  updated_at: "2026-10-17T00:00:00Z",
};
const photo = () =>
  new File(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZZkAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    "person.png",
    { type: "image/png" },
  );
const response = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;
let decode: ReturnType<typeof vi.fn>;
let revoked: ReturnType<typeof vi.fn>;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  setActiveSession("owner-a", "token-a");
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  decode = vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() });
  vi.stubGlobal("createImageBitmap", decode);
  revoked = vi.fn();
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:result"),
    revokeObjectURL: revoked,
  });
  fetchMock = vi
    .fn()
    .mockImplementation(async (url: string) =>
      url.includes("/capabilities") ? response(cap) : response({ items: [] }),
    );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  client.clear();
  act(() => setActiveSession(null, null));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const posts = () =>
  fetchMock.mock.calls.filter((call) => call[1]?.method === "POST");
describe("honest owner-scoped try-on tasks", () => {
  it("polls persisted active tasks with GET only and exposes the real final result", async () => {
    let reads = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/capabilities")) return response(cap);
      if (url.endsWith("/image"))
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["result"], { type: "image/png" }),
        };
      return response({
        items: [
          ++reads === 1
            ? { ...task, status: "processing", result_url: null }
            : task,
        ],
      });
    });
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(result.current.tasks[0]?.status).toBe("processing"),
    );
    await waitFor(
      () => expect(result.current.tasks[0]?.status).toBe("succeeded"),
      { timeout: 4500 },
    );
    await waitFor(() =>
      expect(result.current.tasks[0]?.resultImageUrl).toBe("blob:result"),
    );
    expect(reads).toBe(2);
    expect(posts()).toHaveLength(0);
  }, 10000);
  it("does not treat a capability service failure as configured or generate anything", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: "provider details" }),
    });
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(result.current.capabilityError).toBeTruthy());
    expect(result.current.capabilities).toBeUndefined();
    await act(async () => {
      await expect(
        result.current.create({
          personPhoto: photo(),
          itemId: id,
          consent: true,
        }),
      ).rejects.toMatchObject({ code: "unavailable" });
    });
    expect(posts()).toHaveLength(0);
    expect(decode).not.toHaveBeenCalled();
  });
  it("loads capability and history without generating, and refuses an unavailable service before reading a photo", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/capabilities")
        ? response({
            ...cap,
            configured: false,
            available: false,
            reason: "not_configured",
          })
        : response({ items: [] }),
    );
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(result.current.capabilities?.available).toBe(false),
    );
    await act(async () => {
      await expect(
        result.current.create({
          personPhoto: photo(),
          itemId: id,
          consent: true,
        }),
      ).rejects.toMatchObject({ code: "unavailable" });
    });
    expect(posts()).toHaveLength(0);
    expect(decode).not.toHaveBeenCalled();
  });
  it("requires consent and a valid item ID before sending a file", async () => {
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(result.current.capabilities?.available).toBe(true),
    );
    await act(async () => {
      await expect(
        result.current.create({
          personPhoto: photo(),
          itemId: id,
          consent: false,
        }),
      ).rejects.toMatchObject({ code: "consent-required" });
    });
    await act(async () => {
      await expect(
        result.current.create({
          personPhoto: photo(),
          itemId: "bad",
          consent: true,
        }),
      ).rejects.toMatchObject({ code: "invalid-item" });
    });
    expect(posts()).toHaveLength(0);
    expect(decode).not.toHaveBeenCalled();
  });
  it("sends one consented multipart intent, prevents a double submit, and authorizes result images", async () => {
    let finish!: (value: Response) => void;
    let records: TryOnTask[] = [];
    fetchMock.mockImplementation((url: string, options: RequestInit) => {
      if (url.includes("/capabilities")) return Promise.resolve(response(cap));
      if (options.method === "POST")
        return new Promise<Response>((resolve) => {
          records = [{ ...task, status: "processing", result_url: null }];
          finish = resolve;
        });
      if (url.endsWith("/image"))
        return Promise.resolve({
          ok: true,
          status: 200,
          blob: async () => new Blob(["result"], { type: "image/png" }),
        });
      return Promise.resolve(response({ items: records }));
    });
    const view = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(view.result.current.capabilities?.available).toBe(true),
    );
    const input = { personPhoto: photo(), itemId: id, consent: true };
    let pending!: Promise<unknown>;
    act(() => {
      pending = view.result.current.create(input);
    });
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(view.result.current.isCreating).toBe(true);
    await act(async () => {
      await expect(view.result.current.create(input)).rejects.toMatchObject({
        code: "request-failed",
      });
    });
    const options = posts()[0][1];
    const form = options.body as FormData;
    expect(form.get("item_id")).toBe(id);
    expect(form.get("consent")).toBe("true");
    expect(form.get("person_image")).toBeTruthy();
    expect(options.headers["Idempotency-Key"]).toMatch(/^[a-f0-9-]{36}$/);
    expect(options.headers.Authorization).toBe("Bearer token-a");
    await act(async () => {
      records = [task];
      finish(response(task));
      await pending;
    });
    await waitFor(() =>
      expect(view.result.current.tasks[0]?.resultImageUrl).toBe("blob:result"),
    );
    const imageCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith("/image"),
    )!;
    expect(imageCall[1].headers.Authorization).toBe("Bearer token-a");
    view.unmount();
    expect(revoked).toHaveBeenCalledWith("blob:result");
  });
  it("reuses the same idempotency key only for an explicit retry of an uncertain submission", async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes("/capabilities")) return response(cap);
      if (options.method === "POST") {
        if (++calls === 1) throw new Error("network failed");
        return response({ ...task, status: "failed", result_url: null });
      }
      return response({ items: [] });
    });
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(result.current.capabilities?.available).toBe(true),
    );
    const input = { personPhoto: photo(), itemId: id, consent: true };
    await act(async () => {
      await expect(result.current.create(input)).rejects.toMatchObject({
        code: "request-failed",
      });
    });
    expect(posts()).toHaveLength(1);
    await act(async () => {
      await result.current.create(input);
    });
    expect(posts()).toHaveLength(2);
    expect(posts()[0][1].headers["Idempotency-Key"]).toBe(
      posts()[1][1].headers["Idempotency-Key"],
    );
  });
  it("rejects old callbacks across a switch away and back without sending or decoding", async () => {
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(result.current.capabilities?.available).toBe(true),
    );
    const old = result.current.create;
    act(() => {
      setActiveSession("owner-b", "token-b");
      setActiveSession("owner-a", "token-a");
    });
    await act(async () => {
      await expect(
        old({ personPhoto: photo(), itemId: id, consent: true }),
      ).rejects.toMatchObject({ code: "session-changed" });
    });
    expect(posts()).toHaveLength(0);
    expect(decode).not.toHaveBeenCalled();
  });
  it("aborts an in-flight old-owner submit and ignores its late success", async () => {
    let finish!: (value: Response) => void;
    fetchMock.mockImplementation((url: string, options: RequestInit) =>
      options.method === "POST"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(
            url.includes("/capabilities")
              ? response(cap)
              : response({ items: [] }),
          ),
    );
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(result.current.capabilities?.available).toBe(true),
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current
        .create({ personPhoto: photo(), itemId: id, consent: true })
        .catch((error) => error);
    });
    await waitFor(() => expect(posts()).toHaveLength(1));
    act(() => setActiveSession("owner-b", "token-b"));
    expect(posts()[0][1].signal.aborted).toBe(true);
    await act(async () => {
      finish(response(task));
      await pending;
    });
    expect(result.current.tasks).toEqual([]);
  });
  it("accepts a multi-category capability and sends ordered item_ids without the legacy item_id", async () => {
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes("/capabilities"))
        return response({
          ...cap,
          max_items: 4,
          supported_categories: ["bottoms", "outerwear", "shoes"],
          supported_item_types: ["pants", "coat", "sneakers"],
        });
      if (options.method === "POST")
        return response({
          ...task,
          item_ids: [id, otherId],
          status: "queued",
          result_url: null,
        });
      return response({ items: [] });
    });
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(result.current.capabilities?.max_items).toBe(4));
    await act(async () => {
      const created = await result.current.create({
        personPhoto: photo(),
        itemIds: [id, otherId],
        consent: true,
      });
      expect(created.item_ids).toEqual([id, otherId]);
    });
    expect(posts()).toHaveLength(1);
    const form = posts()[0][1].body as FormData;
    expect(form.get("item_ids")).toBe(JSON.stringify([id, otherId]));
    expect(form.has("item_id")).toBe(false);
    expect(form.get("consent")).toBe("true");
  });
  it("refuses empty, duplicate, malformed, over-capacity and mutually specified input before decoding", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/capabilities")
        ? response({ ...cap, max_items: 2 })
        : response({ items: [] }),
    );
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(result.current.capabilities?.max_items).toBe(2));
    const invalid = [
      { itemIds: [] },
      { itemIds: [id, id.toUpperCase()] },
      { itemIds: ["unknown-uuid"] },
      { itemIds: [id, otherId, taskId] },
      { itemIds: [id], itemId: id },
      { itemIds: [42] },
    ];
    for (const selection of invalid)
      await act(async () => {
        await expect(
          result.current.create({
            personPhoto: photo(),
            consent: true,
            ...selection,
          } as Parameters<typeof result.current.create>[0]),
        ).rejects.toMatchObject({ code: "invalid-item" });
      });
    expect(posts()).toHaveLength(0);
    expect(decode).not.toHaveBeenCalled();
  });
  it("normalizes legacy history to item_ids and rejects malformed multi-item task responses", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/capabilities")
        ? response(cap)
        : response({ items: [task] }),
    );
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() =>
      expect(result.current.tasks[0]?.item_ids).toEqual([id]),
    );
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/capabilities")
        ? response(cap)
        : response({ items: [{ ...task, item_ids: [id, id] }] }),
    );
    await act(async () => {
      await result.current.refetchTasks();
    });
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: "request-failed" }),
    );
  });
  it("reuses an uncertain multi-item intent only when its ordered items and file are unchanged", async () => {
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes("/capabilities"))
        return response({ ...cap, max_items: 4 });
      if (options.method === "POST")
        throw new Error("uncertain network result");
      return response({ items: [] });
    });
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(result.current.capabilities?.max_items).toBe(4));
    const image = photo();
    for (const itemIds of [
      [id, otherId],
      [id, otherId],
      [otherId, id],
    ])
      await act(async () => {
        await expect(
          result.current.create({ personPhoto: image, itemIds, consent: true }),
        ).rejects.toMatchObject({ code: "request-failed" });
      });
    expect(posts()).toHaveLength(3);
    expect(posts()[0][1].headers["Idempotency-Key"]).toBe(
      posts()[1][1].headers["Idempotency-Key"],
    );
    expect(posts()[2][1].headers["Idempotency-Key"]).not.toBe(
      posts()[1][1].headers["Idempotency-Key"],
    );
  });
  it("does not accept a submitted task for different ordered garments or automatically submit it again", async () => {
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (url.includes("/capabilities"))
        return response({ ...cap, max_items: 4 });
      if (options.method === "POST")
        return response({
          ...task,
          item_ids: [id],
          status: "queued",
          result_url: null,
        });
      return response({ items: [] });
    });
    const { result } = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(result.current.capabilities?.max_items).toBe(4));
    await act(async () => {
      await expect(
        result.current.create({
          personPhoto: photo(),
          itemIds: [id, otherId],
          consent: true,
        }),
      ).rejects.toMatchObject({ code: "request-failed" });
    });
    expect(posts()).toHaveLength(1);
    expect(result.current.tasks).toEqual([]);
  });
});

describe("lossless result loading", () => {
  it("reuses original bytes on a same-session remount while revoking detached URLs", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/capabilities")) return response(cap);
      if (url.endsWith("/image")) return {
        ok: true, status: 200,
        blob: async () => new Blob(["unchanged original"], { type: "image/jpeg" }),
      };
      return response({ items: [task] });
    });
    const first = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(first.result.current.tasks[0]?.resultImageUrl).toBeTruthy());
    first.unmount();
    expect(revoked).toHaveBeenCalledWith("blob:result");
    const second = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(second.result.current.tasks[0]?.resultImageUrl).toBeTruthy());
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith("/image"))).toHaveLength(1);
    second.unmount();
    act(() => { setActiveSession(null, null); setActiveSession("owner-a", "token-a"); });
    const third = renderHook(useTryOn, { wrapper });
    await waitFor(() => expect(third.result.current.tasks[0]?.resultImageUrl).toBeTruthy());
    expect(fetchMock.mock.calls.filter(c => String(c[0]).endsWith("/image"))).toHaveLength(2);
    expect(posts()).toHaveLength(0);
  });

  it("loads the selected original first and limits background downloads to two", async () => {
    const tasks = [taskId, otherId, id].map((key) => ({ ...task, id: key, result_url: `/api/v1/tryon/tasks/${key}/image` }));
    const pending: (() => void)[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/capabilities")) return response(cap);
      if (url.endsWith("/image")) return new Promise(resolve => pending.push(() => resolve({
        ok: true, status: 200, blob: async () => new Blob(["original"], {type:"image/jpeg"}),
      })));
      return response({ items: tasks });
    });
    const view = renderHook(() => useTryOn(id), { wrapper });
    await waitFor(() => expect(pending).toHaveLength(2));
    const images = () => fetchMock.mock.calls.filter(c => String(c[0]).endsWith("/image"));
    expect(images()).toHaveLength(2);
    expect(String(images()[0][0])).toContain(id);
    await act(async () => pending.shift()!());
    await waitFor(() => expect(images()).toHaveLength(3));
    await act(async () => pending.splice(0).forEach(finish => finish()));
    await waitFor(() => expect(view.result.current.tasks.every(t => t.resultImageUrl)).toBe(true));
  });
});
