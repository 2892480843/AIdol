// @vitest-environment node
import "fake-indexeddb/auto";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import {
  createWornLook,
  listWornLooks,
  updateWornLook,
  deleteWornLook,
} from "@/lib/looks/storage";
import { validateLookPhoto } from "@/lib/looks/photo";
const png = () =>
  new Blob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZZkAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    { type: "image/png" },
  );
const uuid = "11111111-1111-4111-8111-111111111111";
const input = () => ({ name: "My look", itemIds: [uuid], photoBlob: png() });
let decode: ReturnType<typeof vi.fn>;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  setActiveSession("owner-a", "token-a");
  decode = vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() });
  vi.stubGlobal("createImageBitmap", decode);
});
afterEach(() => {
  setActiveSession(null, null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("private worn look IndexedDB records", () => {
  it("persists Blob photos across fresh reads and supports explicit metadata/photo update and deletion", async () => {
    const created = await createWornLook(input(), "owner-a");
    const [loaded] = await listWornLooks("owner-a");
    expect(loaded.id).toBe(created.id);
    expect(loaded.photoBlob).toBeInstanceOf(Blob);
    expect(await loaded.photoBlob.arrayBuffer()).toEqual(
      await created.photoBlob.arrayBuffer(),
    );
    const edited = await updateWornLook(
      created.id,
      { name: "Updated", itemIds: [], photoBlob: png() },
      "owner-a",
    );
    expect(edited.createdAt).toBe(created.createdAt);
    expect(edited.name).toBe("Updated");
    await deleteWornLook(created.id, "owner-a");
    expect(await listWornLooks("owner-a")).toEqual([]);
  });
  it("isolates list, update and delete from another owner and retains the original owner records", async () => {
    const created = await createWornLook(input(), "owner-a");
    setActiveSession("owner-b", "token-b");
    expect(await listWornLooks("owner-b")).toEqual([]);
    await expect(
      updateWornLook(created.id, { name: "Wrong" }, "owner-b"),
    ).rejects.toMatchObject({ code: "not-found" });
    await expect(deleteWornLook(created.id, "owner-b")).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(listWornLooks("owner-a")).rejects.toMatchObject({
      code: "session-changed",
    });
    setActiveSession("owner-a", "token-a");
    expect(await listWornLooks("owner-a")).toHaveLength(1);
  });
  it("enforces the 20-per-owner limit atomically across simultaneous creates", async () => {
    for (let i = 0; i < 19; i++) await createWornLook(input(), "owner-a");
    const result = await Promise.allSettled([
      createWornLook(input(), "owner-a"),
      createWornLook(input(), "owner-a"),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "limit-reached" },
    });
    expect(await listWornLooks("owner-a")).toHaveLength(20);
    setActiveSession("owner-b", "token-b");
    await expect(createWornLook(input(), "owner-b")).resolves.toHaveProperty(
      "ownerId",
      "owner-b",
    );
  });
  it("does not write a photo after switch-away-and-back during decoding", async () => {
    let finish!: (bitmap: unknown) => void;
    decode.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = createWornLook(input(), "owner-a");
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    setActiveSession("owner-b", "token-b");
    setActiveSession("owner-a", "token-a");
    finish({ width: 1, height: 1, close: vi.fn() });
    await expect(pending).rejects.toMatchObject({ code: "session-changed" });
    expect(await listWornLooks("owner-a")).toEqual([]);
  });
  it("reports quota failures without returning an uncommitted success", async () => {
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementationOnce(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    await expect(createWornLook(input(), "owner-a")).rejects.toMatchObject({
      code: "quota-exceeded",
    });
    expect(await listWornLooks("owner-a")).toEqual([]);
  });
  it("reports unavailable storage honestly", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(listWornLooks("owner-a")).rejects.toMatchObject({
      code: "storage-unavailable",
    });
  });
  it.each([
    { name: "" },
    { name: "x".repeat(101) },
    { itemIds: ["not-a-uuid"] },
    { itemIds: Array(13).fill(uuid) },
  ])("rejects invalid metadata: %j", async (patch) => {
    await expect(
      createWornLook({ ...input(), ...patch }, "owner-a"),
    ).rejects.toHaveProperty("code");
    expect(await listWornLooks("owner-a")).toEqual([]);
  });
});
describe("real photo validation boundary", () => {
  it("checks magic bytes and decodes the image, closing the decoder resource", async () => {
    const close = vi.fn();
    decode.mockResolvedValueOnce({ width: 1, height: 1, close });
    await validateLookPhoto(png());
    expect(decode).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it.each([
    new Blob(["not an image"], { type: "image/png" }),
    new Blob(["svg"], { type: "image/svg+xml" }),
    new Blob([], { type: "image/png" }),
  ])("rejects invalid format without decoding", async (blob) => {
    await expect(validateLookPhoto(blob)).rejects.toMatchObject({
      code: "invalid-photo",
    });
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects files larger than 10MiB before reading/decoding them", async () => {
    await expect(
      validateLookPhoto(
        new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }),
      ),
    ).rejects.toMatchObject({ code: "photo-too-large" });
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects decode failures and zero dimensions", async () => {
    decode.mockRejectedValueOnce(new Error("decoder rejected"));
    await expect(validateLookPhoto(png())).rejects.toMatchObject({
      code: "invalid-photo",
    });
    const close = vi.fn();
    decode.mockResolvedValueOnce({ width: 0, height: 1, close });
    await expect(validateLookPhoto(png())).rejects.toMatchObject({
      code: "invalid-photo",
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
