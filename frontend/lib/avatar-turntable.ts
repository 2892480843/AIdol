const DURATION_MS = 6_000;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;

/** Record actual WebGL frames locally; never request camera or screen permissions. */
export async function recordAvatarTurntable(
  canvas: HTMLCanvasElement,
  draw: (progress: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted || typeof MediaRecorder === "undefined" || typeof canvas.captureStream !== "function")
    throw new Error("Canvas video recording unavailable");
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("Video encoder unavailable");
  const stream = canvas.captureStream(30);
  return await new Promise<Blob>((resolve, reject) => {
    let recorder: MediaRecorder | undefined;
    let frame = 0, startedAt: number | undefined, bytes = 0;
    let settled = false;
    let completedOrbit = false;
    const chunks: Blob[] = [];
    const cleanup = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      stream.getTracks().forEach(track => track.stop());
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (recorder?.state === "recording") recorder.stop();
      reject(error instanceof Error ? error : new Error("Video recording failed"));
    };
    const abort = () => fail(new Error("Video recording cancelled"));
    // A hidden/throttled tab must fail visibly rather than return an incomplete orbit.
    const timeout = setTimeout(() => fail(new Error("Video recording timed out")), 15_000);
    signal.addEventListener("abort", abort, { once: true });
    const tick = (time: number) => {
      if (settled) return;
      startedAt ??= time;
      const progress = Math.min(1, (time - startedAt) / DURATION_MS);
      try {
        draw(progress);
        if (progress === 1) {
          completedOrbit = true;
          recorder!.stop();
        }
        else frame = requestAnimationFrame(tick);
      } catch (error) { fail(error); }
    };
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
      recorder.addEventListener("dataavailable", event => {
        if (settled || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > MAX_VIDEO_BYTES) { fail(new Error("Video exceeds size limit")); return; }
        chunks.push(event.data);
      });
      recorder.addEventListener("error", () => fail(new Error("Video encoding failed")));
      recorder.addEventListener("stop", () => {
        if (settled) return;
        if (!completedOrbit || !chunks.length) { fail(new Error("Incomplete video recording")); return; }
        settled = true;
        cleanup();
        resolve(new Blob(chunks, { type: recorder!.mimeType || mimeType }));
      });
      draw(0);
      recorder.start(250);
      frame = requestAnimationFrame(tick);
    } catch (error) { fail(error); }
  });
}
