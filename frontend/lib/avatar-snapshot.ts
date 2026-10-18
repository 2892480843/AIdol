import { normalizeAvatarThumbnail } from "./avatar-journal";

/** Resize a local 3D render capture. Never pass user photos through this helper. */
export async function createAvatarThumbnail(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (!bitmap.width || !bitmap.height)
      throw new Error("Invalid avatar render");
    canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 220;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Avatar thumbnail canvas unavailable");
    context.fillStyle = "#eee9e2";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(
      canvas.width / bitmap.width,
      canvas.height / bitmap.height,
    );
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    const thumbnail = normalizeAvatarThumbnail(
      canvas.toDataURL("image/webp", 0.65),
    );
    if (!thumbnail)
      throw new Error("Avatar thumbnail exceeds its bounded WebP format");
    return thumbnail;
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    bitmap.close();
  }
}
