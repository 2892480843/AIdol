import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  useFittingCamera,
  useFittingVoice,
} from "@/lib/hooks/use-fitting-media";

const stop = vi.fn();
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
const getUserMedia = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("fitting media lifecycle", () => {
  it("never opens a device on mount and requests video only after an explicit start", async () => {
    getUserMedia.mockResolvedValue(stream);
    const h = renderHook(() => useFittingCamera());
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => {
      await h.result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false }),
    );
    expect(h.result.current.stream).toBe(stream);
    act(() => h.result.current.stop());
    expect(stop).toHaveBeenCalledOnce();
    expect(h.result.current.stream).toBeNull();
  });
  it("releases the stream if permission resolves after the page closes", async () => {
    let resolve!: (value: MediaStream) => void;
    getUserMedia.mockReturnValue(
      new Promise<MediaStream>((r) => {
        resolve = r;
      }),
    );
    const h = renderHook(() => useFittingCamera());
    let pending!: Promise<void>;
    act(() => {
      pending = h.result.current.start();
    });
    h.unmount();
    await act(async () => {
      resolve(stream);
      await pending;
    });
    expect(stop).toHaveBeenCalledOnce();
  });
  it("shows a recoverable error when camera permission is denied", async () => {
    getUserMedia.mockRejectedValue(new Error("NotAllowedError"));
    const h = renderHook(() => useFittingCamera());
    await act(async () => {
      await h.result.current.start();
    });
    expect(h.result.current.error).toBe(true);
    expect(h.result.current.pending).toBe(false);
  });
  it("stops the camera on unmount and does not issue duplicate requests", async () => {
    getUserMedia.mockResolvedValue(stream);
    const h = renderHook(() => useFittingCamera());
    await act(async () => {
      await Promise.all([h.result.current.start(), h.result.current.start()]);
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    h.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });
  it("fails capture cleanly when the video has no decoded frame", async () => {
    const h = renderHook(() => useFittingCamera());
    await expect(
      h.result.current.capture(document.createElement("video")),
    ).rejects.toThrow();
  });
  it("reports unsupported speech without opening a microphone", async () => {
    const h = renderHook(() => useFittingVoice(vi.fn(), "zh-CN"));
    expect(h.result.current.supported).toBe(false);
    act(() => h.result.current.start());
    expect(h.result.current.listening).toBe(false);
  });
  it("publishes final speech only and aborts on unmount", async () => {
    let recognition: {
      onresult: ((e: unknown) => void) | null;
      onend: (() => void) | null;
      abort: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
    };
    class FakeRecognition {
      onresult = null;
      onend = null;
      onerror = null;
      abort = vi.fn();
      start = vi.fn();
      stop = vi.fn();
      constructor() {
        recognition = this;
      }
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: FakeRecognition,
      configurable: true,
    });
    const receive = vi.fn();
    const h = renderHook(() => useFittingVoice(receive, "zh-CN"));
    await waitFor(() => expect(h.result.current.supported).toBe(true));
    expect(recognition!).toBeUndefined();
    act(() => h.result.current.start());
    act(() =>
      recognition!.onresult?.({
        results: [
          Object.assign([{ transcript: "黄色连衣裙" }], { isFinal: true }),
        ],
      }),
    );
    expect(receive).toHaveBeenCalledWith("黄色连衣裙");
    h.unmount();
    expect(recognition!.abort).toHaveBeenCalledOnce();
    act(() =>
      recognition!.onresult?.({
        results: [Object.assign([{ transcript: "late" }], { isFinal: true })],
      }),
    );
    expect(receive).toHaveBeenCalledTimes(1);
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  });
});
