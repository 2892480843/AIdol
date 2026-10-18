"use client";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { getActiveUserId, subscribeActiveSession } from "@/lib/api";
import { LookStorageError } from "./types";

const SERVER_SCOPE = { ownerId: null, epoch: 0 } as const;
export function useLooksOwnerScope() {
  const current = useRef<{ ownerId: string | null; epoch: number }>({
    ownerId: getActiveUserId(),
    epoch: 0,
  });
  const snapshot = useCallback(() => {
    const owner = getActiveUserId();
    if (owner !== current.current.ownerId)
      current.current = { ownerId: owner, epoch: current.current.epoch + 1 };
    return current.current;
  }, []);
  const subscribe = useCallback(
    (listener: () => void) =>
      subscribeActiveSession(() => {
        snapshot();
        listener();
      }),
    [snapshot],
  );
  const { ownerId, epoch } = useSyncExternalStore(
    subscribe,
    snapshot,
    () => SERVER_SCOPE,
  );
  const capture = useCallback(() => {
    const assert = () => {
      if (
        !ownerId ||
        ownerId !== getActiveUserId() ||
        current.current.ownerId !== ownerId ||
        current.current.epoch !== epoch
      )
        throw new LookStorageError("session-changed");
    };
    assert();
    return {
      ownerId: ownerId!,
      epoch,
      assert,
      isCurrent: () => {
        try {
          assert();
          return true;
        } catch {
          return false;
        }
      },
    };
  }, [ownerId, epoch]);
  return { ownerId, epoch, capture };
}
