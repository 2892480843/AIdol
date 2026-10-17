import {
  api,
  getAccessToken,
  getActiveUserId,
  subscribeActiveSession,
} from "@/lib/api";
import { OCCASION_VALUES } from "@/lib/generated/garment-vocabulary";
import { isInspirationItemEligible } from "@/lib/inspiration/matching";
import type { Item } from "@/lib/types";

export type InspirationSeed = {
  itemIds: string[];
  occasion: string;
  name: string;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const occasions = new Set<string>(OCCASION_VALUES);
const MAX_ITEMS = 12;

export function parseInspirationSeed(
  params: Pick<URLSearchParams, "get" | "has">,
): InspirationSeed | null {
  if (!params.has("seed")) return null;
  const ids = (params.get("seed") ?? "").split(",");
  const occasion = params.get("occasion") ?? "casual";
  if (
    ids.length > MAX_ITEMS ||
    ids.some((id) => !uuid.test(id)) ||
    !occasions.has(occasion)
  ) {
    throw new Error("Invalid inspiration seed");
  }
  return {
    itemIds: Array.from(new Set(ids.map((id) => id.toLowerCase()))),
    occasion,
    name: (params.get("name") ?? "").trim().slice(0, 100),
  };
}

export function buildInspirationStudioUrl(
  itemIds: string[],
  occasion: string,
  name: string,
): string {
  const params = new URLSearchParams({
    seed: itemIds.join(","),
    occasion,
    name,
  });
  const seed = parseInspirationSeed(params)!;
  params.set("seed", seed.itemIds.join(","));
  params.set("name", seed.name);
  return `/dashboard/outfits/new?${params.toString()}`;
}

/** Exact per-item reads enforce ownership; GET /items has no ids filter. */
export async function loadInspirationSeed(
  seed: InspirationSeed,
  ownerId: string,
  signal?: AbortSignal,
): Promise<Item[]> {
  // Validate even when called without the URL parser.
  parseInspirationSeed(
    new URLSearchParams({
      seed: seed.itemIds.join(","),
      occasion: seed.occasion,
    }),
  );
  const token = getAccessToken();
  const controller = new AbortController();
  const abort = () => controller.abort();
  const unsubscribe = subscribeActiveSession(abort);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const assertSession = () => {
    if (
      controller.signal.aborted ||
      !ownerId ||
      getActiveUserId() !== ownerId ||
      getAccessToken() !== token ||
      !token
    ) {
      throw new Error("Inspiration session changed");
    }
  };
  try {
    assertSession();
    return await Promise.all(
      seed.itemIds.map(async (id) => {
        assertSession();
        const item = await api.get<Item>(`/items/${id}`, {
          signal: controller.signal,
        });
        assertSession();
        if (
          item.id.toLowerCase() !== id.toLowerCase() ||
          item.user_id !== ownerId ||
          !isInspirationItemEligible(item)
        ) {
          throw new Error("Inspiration item unavailable");
        }
        return item;
      }),
    );
  } catch (error) {
    assertSession();
    throw error;
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
