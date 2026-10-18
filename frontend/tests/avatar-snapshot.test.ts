import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAvatarThumbnail } from "@/lib/avatar-snapshot";

const thumbnail = "data:image/webp;base64,UklGRg==";
let canvas: HTMLCanvasElement;
let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
let context: {
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  bitmap = { width: 400, height: 400, close: vi.fn() };
  context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  canvas = document.createElement("canvas");
  vi.spyOn(document, "createElement").mockReturnValue(canvas);
  vi.spyOn(canvas, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(canvas, "toDataURL").mockReturnValue(thumbnail);
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("local 3D snapshot thumbnail", () => {
  it("contains the render in a neutral 160×220 portrait and releases resources", async () => {
    const blob = new Blob(["local-render"], { type: "image/png" });
    await expect(createAvatarThumbnail(blob)).resolves.toBe(thumbnail);
    expect(createImageBitmap).toHaveBeenCalledWith(blob);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 160, 220);
    expect(context.fillStyle).toMatch(/^#/);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 30, 160, 160);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/webp", 0.65);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
  it("contains a tall render without cropping", async () => {
    bitmap.width = 100;
    bitmap.height = 400;
    await createAvatarThumbnail(new Blob(["render"]));
    const [image, x, y, width, height] = context.drawImage.mock.calls[0];
    expect(image).toBe(bitmap);
    expect(x).toBeCloseTo(52.5);
    expect(y).toBeCloseTo(0);
    expect(width).toBeCloseTo(55);
    expect(height).toBeCloseTo(220);
  });
  it("rejects oversize and non-WebP encodings without leaking the bitmap or canvas", async () => {
    for (const value of [
      "data:image/webp;base64," + "A".repeat(24_000),
      "data:image/png;base64,aW1hZ2U=",
      "data:image/svg+xml;base64,PHN2Zz4=",
    ]) {
      vi.mocked(canvas.toDataURL).mockReturnValue(value);
      await expect(
        createAvatarThumbnail(new Blob(["render"])),
      ).rejects.toThrow();
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
    }
    expect(bitmap.close).toHaveBeenCalledTimes(3);
  });
  it("releases resources when encoding fails or the canvas is unavailable", async () => {
    vi.mocked(canvas.toDataURL).mockImplementation(() => {
      throw new Error("encoding failed");
    });
    await expect(createAvatarThumbnail(new Blob(["render"]))).rejects.toThrow(
      "encoding failed",
    );
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    vi.mocked(canvas.getContext).mockReturnValue(null);
    await expect(createAvatarThumbnail(new Blob(["render"]))).rejects.toThrow();
    expect(bitmap.close).toHaveBeenCalledTimes(2);
    expect(canvas.height).toBe(0);
  });
  it("rejects decoding failure without creating a canvas", async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error("cannot decode"));
    await expect(createAvatarThumbnail(new Blob(["render"]))).rejects.toThrow(
      "cannot decode",
    );
    expect(document.createElement).not.toHaveBeenCalled();
  });
});
