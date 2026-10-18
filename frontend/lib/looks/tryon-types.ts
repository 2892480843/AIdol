export type TryOnStatus =
  "submitting" | "queued" | "processing" | "succeeded" | "failed";
export type TryOnCategory =
  "tops" | "bottoms" | "dresses" | "outerwear" | "shoes";
export interface TryOnCapabilities {
  configured: boolean;
  enabled: boolean;
  available: boolean;
  reason: "not_configured" | "disabled" | null;
  provider: "seedream";
  model: string;
  accepted_mime_types: string[];
  max_person_image_bytes: number;
  supported_categories: TryOnCategory[];
  supported_item_types: string[];
  item_type_slots?: Record<string, TryOnCategory>;
  max_items: number;
  output: "image";
  poll_interval_ms: number;
}
export interface TryOnTask {
  id: string;
  item_id: string;
  /** Older task responses contain only item_id; useTryOn normalizes those on read. */
  item_ids?: string[];
  status: TryOnStatus;
  result_url: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}
export type TryOnTaskPreview = TryOnTask & {
  resultImageUrl?: string;
  resultImageError?: boolean;
};
export type TryOnInput = {
  personPhoto: File;
  consent: boolean;
} & (
  { itemIds: string[]; itemId?: never } | { itemId: string; itemIds?: never }
);
export class TryOnError extends Error {
  constructor(
    public readonly code:
      | "unavailable"
      | "consent-required"
      | "invalid-item"
      | "request-failed"
      | "session-changed",
  ) {
    super(code);
    this.name = "TryOnError";
  }
}
