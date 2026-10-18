import type { QueryClient } from "@tanstack/react-query";
import { getActiveSessionRevision, getActiveUserId } from "@/lib/api";

const PREFIX = ["tryon-result-bytes"] as const;
const MAX_AGE = 2 * 60_000;
const MAX_BYTES = 32 * 1024 * 1024;

function prune(client: QueryClient) {
  const owner = getActiveUserId();
  const revision = getActiveSessionRevision();
  let bytes = 0;
  const queries = client.getQueryCache().findAll({ queryKey: PREFIX }).reverse()
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  for (const query of queries) {
    const blob = query.state.data;
    const expired = Date.now() - query.state.dataUpdatedAt >= MAX_AGE;
    if (query.queryKey[1] !== owner || query.queryKey[2] !== revision || expired ||
        !(blob instanceof Blob) || bytes + blob.size > MAX_BYTES) {
      client.removeQueries({ queryKey: query.queryKey, exact: true });
    } else bytes += blob.size;
  }
}

/** Memory only, original bytes only. Account/session changes cannot reuse a cached result. */
export function readResultImage(client: QueryClient, owner: string, source: string) {
  prune(client);
  if (owner !== getActiveUserId()) return undefined;
  return client.getQueryData<Blob>([...PREFIX, owner, getActiveSessionRevision(), source]);
}

export function cacheResultImage(client: QueryClient, owner: string, source: string, blob: Blob) {
  if (owner !== getActiveUserId() || blob.size > MAX_BYTES) return;
  client.setQueryDefaults(PREFIX, { gcTime: MAX_AGE, staleTime: Infinity });
  client.setQueryData([...PREFIX, owner, getActiveSessionRevision(), source], blob);
  prune(client);
}
