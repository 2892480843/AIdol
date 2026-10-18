import { API_BASE_PATH, ApiError } from "@/lib/api";
import { captureLookSession } from "./session";
import { TryOnError } from "./tryon-types";

export async function tryOnRequest<T>(
  ownerId: string,
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
  blobResult = false,
): Promise<T> {
  const scope = captureLookSession(ownerId, true);
  const controller = new AbortController();
  const abort = () => controller.abort();
  scope.signal.addEventListener("abort", abort, { once: true });
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted || scope.signal.aborted) abort();
  const timer = setTimeout(abort, options.method === "POST" ? 120000 : 15000);
  try {
    scope.assert();
    if (!scope.token) throw new TryOnError("session-changed");
    const response = await fetch(`${API_BASE_PATH}${path}`, {
      ...options,
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
      headers: { ...options.headers, Authorization: `Bearer ${scope.token}` },
    });
    scope.assert();
    if (controller.signal.aborted) throw new TryOnError("request-failed");
    if (!response.ok)
      throw new ApiError("Try-on request failed", response.status, null);
    const result = blobResult ? await response.blob() : await response.json();
    scope.assert();
    if (controller.signal.aborted) throw new TryOnError("request-failed");
    return result as T;
  } catch (error) {
    scope.assert();
    if (error instanceof TryOnError) throw error;
    throw new TryOnError("request-failed");
  } finally {
    clearTimeout(timer);
    scope.dispose();
    scope.signal.removeEventListener("abort", abort);
    signal?.removeEventListener("abort", abort);
  }
}
