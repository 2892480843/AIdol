import {
  LOOK_PHOTO_MIME_TYPES,
  MAX_LOOK_PHOTO_BYTES,
  LookStorageError,
} from "./types";

const isAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new LookStorageError("session-changed");
};

async function decodePhoto(blob: Blob, signal?: AbortSignal): Promise<void> {
  isAborted(signal);
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob).catch(() => {
      throw new LookStorageError("invalid-photo");
    });
    try {
      isAborted(signal);
      if (bitmap.width <= 0 || bitmap.height <= 0)
        throw new LookStorageError("invalid-photo");
    } finally {
      bitmap.close();
    }
    return;
  }
  if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function")
    throw new LookStorageError("invalid-photo");
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        image.onload = null;
        image.onerror = null;
        if (error) {
          image.src = "";
          reject(error);
        } else resolve();
      };
      const abort = () => finish(new LookStorageError("session-changed"));
      const timer = setTimeout(
        () => finish(new LookStorageError("invalid-photo")),
        15000,
      );
      image.onload = () =>
        finish(
          image.naturalWidth > 0 && image.naturalHeight > 0
            ? undefined
            : new LookStorageError("invalid-photo"),
        );
      image.onerror = () => finish(new LookStorageError("invalid-photo"));
      signal?.addEventListener("abort", abort, { once: true });
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function validateLookPhoto(
  blob: Blob,
  signal?: AbortSignal,
): Promise<void> {
  isAborted(signal);
  if (
    !(blob instanceof Blob) ||
    blob.size === 0 ||
    !(LOOK_PHOTO_MIME_TYPES as readonly string[]).includes(blob.type)
  )
    throw new LookStorageError("invalid-photo");
  if (blob.size > MAX_LOOK_PHOTO_BYTES)
    throw new LookStorageError("photo-too-large");
  const header = blob.slice(0, 12);
  const buffer =
    typeof header.arrayBuffer === "function"
      ? await header.arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(new LookStorageError("invalid-photo"));
          reader.readAsArrayBuffer(header);
        });
  const bytes = new Uint8Array(buffer);
  isAborted(signal);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
  const webp =
    bytes[0] === 82 &&
    bytes[1] === 73 &&
    bytes[2] === 70 &&
    bytes[3] === 70 &&
    bytes[8] === 87 &&
    bytes[9] === 69 &&
    bytes[10] === 66 &&
    bytes[11] === 80;
  if (
    !(
      (blob.type === "image/jpeg" && jpeg) ||
      (blob.type === "image/png" && png) ||
      (blob.type === "image/webp" && webp)
    )
  )
    throw new LookStorageError("invalid-photo");
  await decodePhoto(blob, signal);
  isAborted(signal);
}
