import {
  getAccessToken,
  getActiveUserId,
  subscribeActiveSession,
} from "@/lib/api";
import { LookStorageError } from "./types";

export function captureLookSession(
  ownerId: string | null = getActiveUserId(),
  includeToken = false,
) {
  const controller = new AbortController();
  const token = getAccessToken();
  const assert = () => {
    if (
      !ownerId ||
      getActiveUserId() !== ownerId ||
      controller.signal.aborted ||
      (includeToken && getAccessToken() !== token)
    )
      throw new LookStorageError("session-changed");
  };
  assert();
  const unsubscribe = subscribeActiveSession(() => {
    if (
      getActiveUserId() !== ownerId ||
      (includeToken && getAccessToken() !== token)
    )
      controller.abort();
  });
  return {
    ownerId: ownerId!,
    token,
    signal: controller.signal,
    assert,
    abort: () => controller.abort(),
    dispose: unsubscribe,
  };
}
export type LookSession = ReturnType<typeof captureLookSession>;
