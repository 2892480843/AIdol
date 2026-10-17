"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getActiveUserId, subscribeActiveSession } from "@/lib/api";

const MAX_SAVES = 100;
const SAVES_CHANGED = "wardrobe:inspiration-saves-changed";
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value);
const storageKey = (owner: string) =>
  `inspiration_saved_v1:${encodeURIComponent(owner)}`;
type SavedState = {
  owner: string | null;
  ids: string[];
  storageError: boolean;
};

function readSaved(owner: string | null): SavedState {
  const state: SavedState = { owner, ids: [], storageError: false };
  if (!owner || typeof window === "undefined") return state;
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return state;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("savedIds" in value) ||
      !Array.isArray(value.savedIds) ||
      value.savedIds.length > MAX_SAVES ||
      !value.savedIds.every(validId)
    ) {
      return { ...state, storageError: true };
    }
    return { ...state, ids: Array.from(new Set(value.savedIds)) };
  } catch {
    return { ...state, storageError: true };
  }
}

/** Local to this browser and authenticated owner; legacy unowned records stay untouched. */
export function useSavedInspirations() {
  const owner = useSyncExternalStore(
    subscribeActiveSession,
    getActiveUserId,
    () => null,
  );
  const [state, setState] = useState<SavedState>(() => readSaved(owner));
  const current = useRef(state);
  const hasPendingWrite = useRef(false);
  useEffect(() => {
    current.current = readSaved(owner);
    hasPendingWrite.current = false;
    setState(current.current);
    if (!owner) return;
    const key = storageKey(owner);
    const refresh = () => {
      if (getActiveUserId() !== owner || hasPendingWrite.current) return;
      const latest = readSaved(owner);
      // A denied read or malformed external value must not erase valid in-memory
      // choices. The error remains visible until storage becomes usable again.
      current.current = latest.storageError
        ? { ...current.current, storageError: true }
        : latest;
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
    window.addEventListener(SAVES_CHANGED, onLocalChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SAVES_CHANGED, onLocalChange);
    };
  }, [owner]);
  const toggle = useCallback(
    (id: string) => {
      if (!owner || getActiveUserId() !== owner || !validId(id)) return;
      const memory =
        current.current.owner === owner ? current.current : readSaved(owner);
      const latest = readSaved(owner);
      // Native storage events are asynchronous. Read before every action so a
      // sequential action in another tab is preserved even before its event.
      const previous =
        hasPendingWrite.current || latest.storageError ? memory : latest;
      const ids = previous.ids.includes(id)
        ? previous.ids.filter((saved) => saved !== id)
        : [...previous.ids, id];
      if (ids.length > MAX_SAVES) return;
      const next: SavedState = { owner, ids, storageError: false };
      try {
        window.localStorage.setItem(
          storageKey(owner),
          JSON.stringify({ version: 1, savedIds: ids }),
        );
        hasPendingWrite.current = false;
      } catch {
        // Keep this session usable, while explicitly reporting that persistence failed.
        next.storageError = true;
        hasPendingWrite.current = true;
      }
      current.current = next;
      setState(next);
      if (!next.storageError) {
        // The browser's storage event only notifies other tabs.
        window.dispatchEvent(
          new CustomEvent(SAVES_CHANGED, { detail: storageKey(owner) }),
        );
      }
    },
    [owner],
  );
  return {
    savedIds: state.owner === owner ? state.ids : [],
    toggle,
    storageError: state.owner === owner && state.storageError,
  };
}
