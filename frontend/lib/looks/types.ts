export const MAX_WORN_LOOKS = 20;
export const MAX_LOOK_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_LOOK_ITEMS = 12;
export const LOOK_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type LookStorageErrorCode =
  | "invalid-photo"
  | "photo-too-large"
  | "invalid-name"
  | "invalid-items"
  | "invalid-record"
  | "limit-reached"
  | "storage-unavailable"
  | "quota-exceeded"
  | "not-found"
  | "session-changed";
export class LookStorageError extends Error {
  constructor(public readonly code: LookStorageErrorCode) {
    super(code);
    this.name = "LookStorageError";
  }
}
export type WornLookInput = {
  photoBlob: Blob;
  name: string;
  itemIds: string[];
};
export type WornLookPatch = Partial<WornLookInput>;
export type WornLook = WornLookInput & {
  id: string;
  ownerId: string;
  createdAt: number;
  schemaVersion: 1;
};
export type WornLookPreview = Omit<
  WornLook,
  "photoBlob" | "ownerId" | "schemaVersion"
> & { photoUrl: string };
