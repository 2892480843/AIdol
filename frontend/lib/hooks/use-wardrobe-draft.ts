"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQueries } from "@tanstack/react-query";
import {
  api,
  ApiError,
  getAccessToken,
  getActiveUserId,
  subscribeActiveSession,
} from "@/lib/api";
import { queryKeys } from "@/lib/hooks/query-keys";
import {
  MAX_RACK_DRAFT_ITEMS,
  normalizeRackDraftIds,
  parseRackDraft,
} from "@/lib/wardrobe-draft";
import type { Item } from "@/lib/types";

const DRAFT_CHANGED = "wardrobe:outfit-draft-changed";
const storageKey = (owner: string) =>
  `wardrobe_draft_v1:${encodeURIComponent(owner)}`;

/** Observe every account boundary, including A → signed out → A batched into one render. */
function useOwnerFence() {
  const owner = useSyncExternalStore(
    subscribeActiveSession,
    getActiveUserId,
    () => null,
  );
  const [epoch, setEpoch] = useState(0);
  const boundary = useRef({ owner, epoch: 0, alive: true });
  useEffect(() => {
    boundary.current.alive = true;
    const sync = () => {
      const next = getActiveUserId();
      if (next === boundary.current.owner) return;
      boundary.current = {
        owner: next,
        epoch: boundary.current.epoch + 1,
        alive: true,
      };
      setEpoch(boundary.current.epoch);
    };
    const unsubscribe = subscribeActiveSession(sync);
    sync();
    return () => {
      boundary.current.alive = false;
      unsubscribe();
    };
  }, []);
  return { owner, epoch, boundary };
}

type DraftState = {
  owner: string | null;
  epoch: number;
  ids: string[];
  hydrated: boolean;
  storageAvailable: boolean;
};
function readDraft(owner: string | null): {
  ids: string[];
  storageAvailable: boolean;
} {
  if (!owner || typeof window === "undefined")
    return { ids: [], storageAvailable: true };
  try {
    const value = parseRackDraft(
      window.localStorage.getItem(storageKey(owner)),
    );
    return { ids: value.ids, storageAvailable: value.valid };
  } catch {
    return { ids: [], storageAvailable: false };
  }
}

/** A browser-local draft. Hydration never writes, so a saved basket cannot be erased on mount. */
export function useWardrobeDraft() {
  const { owner, epoch, boundary } = useOwnerFence();
  const [state, setState] = useState<DraftState>({
    owner: null,
    epoch: -1,
    ids: [],
    hydrated: false,
    storageAvailable: true,
  });
  const current = useRef(state);
  const pendingWrite = useRef(false);
  useEffect(() => {
    if (boundary.current.owner !== owner || boundary.current.epoch !== epoch)
      return;
    current.current = { owner, epoch, ...readDraft(owner), hydrated: true };
    pendingWrite.current = false;
    setState(current.current);
    if (!owner) return;
    const key = storageKey(owner);
    const refresh = () => {
      const fence = boundary.current;
      if (
        !fence.alive ||
        fence.owner !== owner ||
        fence.epoch !== epoch ||
        getActiveUserId() !== owner ||
        pendingWrite.current
      )
        return;
      const latest = readDraft(owner);
      current.current = latest.storageAvailable
        ? { owner, epoch, ...latest, hydrated: true }
        : { ...current.current, storageAvailable: false };
      setState(current.current);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage)
          return;
      } catch {
        refresh();
        return;
      }
      refresh();
    };
    const onLocalChange = (event: Event) => {
      if ((event as CustomEvent<unknown>).detail === key) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(DRAFT_CHANGED, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DRAFT_CHANGED, onLocalChange);
    };
  }, [owner, epoch, boundary]);
  const change = useCallback(
    (action: "toggle" | "remove" | "clear", input?: string) => {
      const fence = boundary.current;
      const memory = current.current;
      if (
        !owner ||
        !fence.alive ||
        fence.owner !== owner ||
        fence.epoch !== epoch ||
        getActiveUserId() !== owner ||
        memory.owner !== owner ||
        memory.epoch !== epoch ||
        !memory.hydrated
      )
        return;
      const id = normalizeRackDraftIds([input])[0];
      if (action !== "clear" && !id) return;
      const latest = readDraft(owner);
      // Read before each action to preserve another tab's sequential changes. A
      // failed write keeps local choices authoritative until a later save succeeds.
      const previous =
        pendingWrite.current || !latest.storageAvailable
          ? memory.ids
          : latest.ids;
      let ids = previous;
      if (action === "clear") ids = [];
      else if (action === "remove" || previous.includes(id))
        ids = previous.filter((saved) => saved !== id);
      else {
        if (previous.length >= MAX_RACK_DRAFT_ITEMS) return;
        ids = [...previous, id];
      }
      const next: DraftState = {
        owner,
        epoch,
        ids,
        hydrated: true,
        storageAvailable: true,
      };
      try {
        window.localStorage.setItem(
          storageKey(owner),
          JSON.stringify({ version: 1, ids }),
        );
        pendingWrite.current = false;
      } catch {
        next.storageAvailable = false;
        pendingWrite.current = true;
      }
      current.current = next;
      setState(next);
      if (next.storageAvailable)
        window.dispatchEvent(
          new CustomEvent(DRAFT_CHANGED, { detail: storageKey(owner) }),
        );
    },
    [owner, epoch, boundary],
  );
  const toggle = useCallback((id: string) => change("toggle", id), [change]);
  const remove = useCallback((id: string) => change("remove", id), [change]);
  const clear = useCallback(() => change("clear"), [change]);
  const isCurrent = state.owner === owner && state.epoch === epoch;
  return {
    owner,
    ids: isCurrent ? state.ids : [],
    hydrated: isCurrent && state.hydrated,
    storageAvailable: !isCurrent || state.storageAvailable,
    toggle,
    remove,
    clear,
  };
}

type DraftEntry = {
  id: string;
  item: Item | null;
  state: "loading" | "ready" | "unavailable" | "error";
};
class DraftUnavailableError extends Error {
  constructor() {
    super("Draft item unavailable");
  }
}

/** Resolve saved IDs independently of the inventory's loaded pages, using the normal item cache. */
export function useWardrobeDraftItems(
  owner: string | null,
  ids: readonly string[],
) {
  const { owner: activeOwner, epoch, boundary } = useOwnerFence();
  const hasToken = useSyncExternalStore(
    subscribeActiveSession,
    () => !!getAccessToken(),
    () => false,
  );
  const normalized = normalizeRackDraftIds(ids);
  const latestIds = useRef(normalized);
  const idKey = normalized.join(",");
  useEffect(() => {
    latestIds.current = normalizeRackDraftIds(ids);
  }, [ids, idKey]);
  const ownsDraft = !!owner && owner === activeOwner;
  const enabled = ownsDraft && hasToken;
  const queries = useQueries({
    queries: normalized.map((id) => ({
      queryKey: queryKeys.item(id),
      enabled,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always" as const,
      refetchOnWindowFocus: true,
      meta: { toastsOwnErrors: true },
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const token = getAccessToken();
        const controller = new AbortController();
        const abort = () => controller.abort();
        const unsubscribe = subscribeActiveSession(abort);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        const assertSession = () => {
          const fence = boundary.current;
          if (
            !owner ||
            !token ||
            !fence.alive ||
            fence.owner !== owner ||
            fence.epoch !== epoch ||
            controller.signal.aborted ||
            getActiveUserId() !== owner ||
            getAccessToken() !== token
          )
            throw new Error("Wardrobe draft session changed");
        };
        try {
          assertSession();
          const item = await api.get<Item>(`/items/${id}`, {
            signal: controller.signal,
          });
          assertSession();
          if (
            item.id !== id ||
            item.user_id !== owner ||
            item.is_archived ||
            item.status === "archived"
          )
            throw new DraftUnavailableError();
          return item;
        } catch (error) {
          assertSession();
          throw error;
        } finally {
          unsubscribe();
          signal.removeEventListener("abort", abort);
        }
      },
    })),
  });
  const entries: DraftEntry[] = ownsDraft
    ? normalized.map((id, index) => {
        const result = queries[index];
        if (!hasToken || result.isPending || result.isFetching)
          return { id, item: null, state: "loading" };
        if (result.error) {
          const unavailable =
            result.error instanceof DraftUnavailableError ||
            (result.error instanceof ApiError &&
              [403, 404].includes(result.error.status));
          return {
            id,
            item: null,
            state: unavailable ? "unavailable" : "error",
          };
        }
        const item = result.data;
        if (
          !item ||
          item.id !== id ||
          item.user_id !== owner ||
          item.is_archived ||
          item.status === "archived"
        )
          return { id, item: null, state: "unavailable" };
        return { id, item, state: "ready" };
      })
    : [];
  const retry = useCallback(async () => {
    const fence = boundary.current;
    if (
      !owner ||
      !fence.alive ||
      fence.owner !== owner ||
      fence.epoch !== epoch ||
      owner !== getActiveUserId() ||
      !getAccessToken()
    )
      return;
    return Promise.all(
      queries.flatMap((query, index) =>
        latestIds.current.includes(normalized[index]) ? [query.refetch()] : [],
      ),
    );
  }, [owner, epoch, boundary, queries, normalized]);
  return {
    entries,
    isLoading: entries.some((entry) => entry.state === "loading"),
    hasErrors: entries.some((entry) => entry.state === "error"),
    retry,
  };
}
