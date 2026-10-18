"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { getActiveUserId, subscribeActiveSession } from "@/lib/api";

type AnchorState = {
  owner: string | null;
  epoch: number;
  anchorId: string | null;
};

/** A page-local choice, fenced even when sign-out and sign-in share one render. */
export function useInspirationAnchor() {
  const owner = useSyncExternalStore(
    subscribeActiveSession,
    getActiveUserId,
    () => null,
  );
  const [state, setState] = useState<AnchorState>(() => ({
    owner,
    epoch: 0,
    anchorId: null,
  }));
  const current = useRef(state);

  useEffect(() => {
    const syncOwner = () => {
      const nextOwner = getActiveUserId();
      if (current.current.owner === nextOwner) return;
      current.current = {
        owner: nextOwner,
        epoch: current.current.epoch + 1,
        anchorId: null,
      };
      setState(current.current);
    };
    syncOwner();
    return subscribeActiveSession(syncOwner);
  }, []);

  const chooseAnchor = useCallback(
    (anchorId: string | null) => {
      const previous = current.current;
      if (
        !owner ||
        getActiveUserId() !== owner ||
        previous.owner !== owner ||
        previous.epoch !== state.epoch
      )
        return;
      current.current = { ...previous, anchorId };
      setState(current.current);
    },
    [owner, state.epoch],
  );

  return {
    anchorId: owner && state.owner === owner ? state.anchorId : null,
    chooseAnchor,
  };
}
