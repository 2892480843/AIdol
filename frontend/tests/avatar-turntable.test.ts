import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordAvatarTurntable } from "@/lib/avatar-turntable";

class Recorder extends EventTarget {
  static latest: Recorder;
  static isTypeSupported = () => true;
  state = "inactive";
  mimeType = "video/webm";
  constructor(_stream: MediaStream) { super(); Recorder.latest = this; }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob(["real-recorded-frames"], { type: "video/webm" }) }));
    this.dispatchEvent(new Event("stop"));
  }
}
let frames: Map<number, FrameRequestCallback>, stop: ReturnType<typeof vi.fn>, canvas: HTMLCanvasElement;
beforeEach(() => {
  frames = new Map(); let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.set(++id, cb); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("MediaRecorder", Recorder);
  stop = vi.fn(); canvas = document.createElement("canvas");
  canvas.captureStream = vi.fn(() => ({ getTracks: () => [{ stop }] } as unknown as MediaStream));
});
afterEach(() => vi.unstubAllGlobals());
function frame(time: number) { const next = frames.entries().next().value!; frames.delete(next[0]); next[1](time); }

describe("real 360 degree render video", () => {
  it("records one complete orbit and releases its canvas stream", async () => {
    const draw = vi.fn(); const promise = recordAvatarTurntable(canvas, draw, new AbortController().signal);
    frame(100); frame(3100); frame(6100);
    const blob = await promise;
    expect(blob.type).toBe("video/webm"); expect(blob.size).toBeGreaterThan(0);
    expect(draw).toHaveBeenCalledWith(0); expect(draw).toHaveBeenCalledWith(0.5); expect(draw).toHaveBeenLastCalledWith(1);
    expect(stop).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  });
  it("rejects an encoder that stops before the full orbit", async () => {
    const promise = recordAvatarTurntable(canvas, vi.fn(), new AbortController().signal);
    Recorder.latest.stop();
    await expect(promise).rejects.toThrow();
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("rejects cancellation instead of publishing a partial orbit", async () => {
    const abort = new AbortController(); const promise = recordAvatarTurntable(canvas, vi.fn(), abort.signal);
    abort.abort(); await expect(promise).rejects.toThrow();
    expect(stop).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  });
  it("does not start recording on unsupported browsers", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    await expect(recordAvatarTurntable(canvas, vi.fn(), new AbortController().signal)).rejects.toThrow();
    expect(canvas.captureStream).not.toHaveBeenCalled();
  });
  it("stops when the WebGL render fails", async () => {
    const draw = vi.fn().mockImplementationOnce(() => { }).mockImplementation(() => { throw new Error("render failed"); });
    const promise = recordAvatarTurntable(canvas, draw, new AbortController().signal);
    frame(100); await expect(promise).rejects.toThrow("render failed");
    expect(stop).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  });
});
