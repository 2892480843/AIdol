import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { Blob as NativeBlob } from "node:buffer";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveSession } from "@/lib/api";
import { useWornLooks } from "@/lib/hooks/use-worn-looks";
const png = () =>
  new NativeBlob(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZZkAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    { type: "image/png" },
  ) as Blob;
let made: ReturnType<typeof vi.fn>;
let revoked: ReturnType<typeof vi.fn>;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  setActiveSession("owner-a", "token-a");
  vi.stubGlobal("Blob", NativeBlob);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() }),
  );
  let counter = 0;
  made = vi.fn(() => `blob:preview-${++counter}`);
  revoked = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: made, revokeObjectURL: revoked }),
  );
});
afterEach(() => {
  act(() => setActiveSession(null, null));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("worn photo hook lifecycle", () => {
  it("retains photos on remount and revokes every owned preview on replacement and unmount", async () => {
    const first = renderHook(useWornLooks);
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    let id!: string;
    await act(async () => {
      id = (
        await first.result.current.create({
          name: "Morning",
          photoBlob: png(),
          itemIds: [],
        })
      ).id;
    });
    expect(first.result.current.looks[0]).toMatchObject({
      id,
      name: "Morning",
      photoUrl: expect.stringMatching(/^blob:/),
    });
    expect("photoBlob" in first.result.current.looks[0]).toBe(false);
    first.unmount();
    const second = renderHook(useWornLooks);
    await waitFor(() => expect(second.result.current.looks).toHaveLength(1));
    await act(async () => {
      await second.result.current.update(id, { name: "Evening" });
    });
    expect(second.result.current.looks[0].name).toBe("Evening");
    second.unmount();
    expect(new Set(revoked.mock.calls.map((call) => call[0]))).toEqual(
      new Set(made.mock.results.map((r) => r.value)),
    );
  });
  it("hides the previous owner and rejects an old create callback even after returning to that owner", async () => {
    const { result } = renderHook(useWornLooks);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      await result.current.create({ name: "A", photoBlob: png(), itemIds: [] });
    });
    const oldCreate = result.current.create;
    act(() => setActiveSession("owner-b", "token-b"));
    expect(result.current.looks).toEqual([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(revoked).toHaveBeenCalled();
    act(() => setActiveSession("owner-a", "token-a"));
    await act(async () => {
      await expect(
        oldCreate({ name: "Late", photoBlob: png(), itemIds: [] }),
      ).rejects.toMatchObject({ code: "session-changed" });
    });
    await waitFor(() => expect(result.current.looks).toHaveLength(1));
  });
  it("deletes only when explicitly requested and surfaces invalid-photo failures", async () => {
    const { result } = renderHook(useWornLooks);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let id!: string;
    await act(async () => {
      id = (
        await result.current.create({
          name: "A",
          photoBlob: png(),
          itemIds: [],
        })
      ).id;
    });
    await act(async () => {
      await expect(
        result.current.create({
          name: "Bad",
          photoBlob: new NativeBlob(["bad"], { type: "image/png" }) as Blob,
          itemIds: [],
        }),
      ).rejects.toMatchObject({ code: "invalid-photo" });
    });
    expect(result.current.error?.code).toBe("invalid-photo");
    expect(result.current.looks).toHaveLength(1);
    await act(async () => {
      await result.current.remove(id);
    });
    expect(result.current.looks).toEqual([]);
  });
});
