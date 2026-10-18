import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { cacheResultImage, readResultImage } from "@/lib/looks/result-image-cache";
import { createImageLoadQueue } from "@/lib/looks/image-load-queue";
let client: QueryClient;
beforeEach(() => { client = new QueryClient(); setActiveSession("a", "token-a"); });
afterEach(() => { client.clear(); setActiveSession(null, null); vi.useRealTimers(); vi.restoreAllMocks(); });
const blob = () => new Blob(["original jpeg"], {type:"image/jpeg"});
describe("private original-byte cache", () => {
  it("returns byte-identical data and isolates result revisions", async () => {
    const original = blob(); cacheResultImage(client, "a", "task:v1", original);
    expect(readResultImage(client, "a", "task:v1")).toBe(original);
    expect(readResultImage(client, "a", "task:v2")).toBeUndefined();
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result);
      reader.onerror = reject; reader.readAsText(readResultImage(client, "a", "task:v1")!);
    });
    expect(text).toBe("original jpeg");
  });
  it("never survives a logout and login, token replacement or foreign owner", () => {
    cacheResultImage(client, "a", "task", blob());
    expect(readResultImage(client, "b", "task")).toBeUndefined();
    setActiveSession("a", "token-refreshed");
    expect(readResultImage(client, "a", "task")).toBeUndefined();
    cacheResultImage(client, "a", "task", blob());
    setActiveSession("b", "token-b"); setActiveSession("a", "token-refreshed");
    expect(readResultImage(client, "a", "task")).toBeUndefined();
    expect(client.getQueryCache().findAll({queryKey:["tryon-result-bytes"]})).toHaveLength(0);
  });
  it("expires after two minutes even if background-tab timers have been suspended", () => {
    const time = Date.now(); cacheResultImage(client, "a", "task", blob());
    vi.spyOn(Date, "now").mockReturnValue(time + 120_001);
    expect(readResultImage(client, "a", "task")).toBeUndefined();
    vi.restoreAllMocks();
  });
  it("bounds retained originals to 32 MiB and refuses oversized retention", () => {
    const large = new Blob([new Uint8Array(17 * 1024 * 1024)]);
    cacheResultImage(client, "a", "first", large);
    cacheResultImage(client, "a", "second", large);
    const retained = client.getQueryCache().findAll({queryKey:["tryon-result-bytes"]});
    expect(retained.reduce((sum,q) => sum + (q.state.data as Blob).size, 0)).toBeLessThanOrEqual(32 * 1024 * 1024);
    cacheResultImage(client, "a", "oversized", new Blob([large, large]));
    expect(readResultImage(client, "a", "oversized")).toBeUndefined();
  });
});
describe("background photo queue", () => {
  it("cancels a queued request without contacting the server and frees capacity after failure", async () => {
    const queue = createImageLoadQueue(); const controller = new AbortController();
    let done!: () => void;
    const hold = queue.add("one", new AbortController().signal, () => new Promise<void>(r => {done = r;}));
    let fail!: (error: Error) => void;
    const failing = queue.add("two", new AbortController().signal, () => new Promise<void>((_,r) => {fail = r;})).catch(() => {});
    const request = vi.fn().mockResolvedValue(blob());
    const cancelled = queue.add("three", controller.signal, request).catch(() => {});
    controller.abort();
    const next = queue.add("four", new AbortController().signal, request);
    fail(new Error("network")); await failing; await next;
    expect(request).toHaveBeenCalledTimes(1);
    done(); await hold; await cancelled;
  });
});
