export const API_BASE_PATH = '/api/v1';

interface FetchOptions extends RequestInit {
  params?: Record<string, string>;
}

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

class NetworkError extends Error {
  constructor(message: string = 'Network error. Please check your connection.') {
    super(message);
    this.name = 'NetworkError';
  }
}

let accessToken: string | null = null;
let activeUserId: string | null = null;
let activeSessionKnown = false;
let activeSessionRevision = 0;

export function getActiveSessionRevision(): number {
  return activeSessionRevision;
}
const sessionListeners = new Set<() => void>();

export function getActiveUserId(): string | null {
  return activeUserId;
}

// The authenticated provider owns this boundary. Token-only hook synchronization
// remains compatible, while persistent queues can observe complete session changes.
export function setActiveSession(userId: string | null, token: string | null) {
  activeSessionKnown = true;
  if (activeUserId === userId && accessToken === token) return;
  activeSessionRevision += 1;
  activeUserId = userId;
  accessToken = token;
  sessionListeners.forEach((listener) => listener());
}

export function subscribeActiveSession(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}

export function setAccessToken(token: string | null, expectedUserId?: string) {
  // Detached hooks may still hold an old session after a provider remount.
  if (expectedUserId !== undefined && activeSessionKnown && expectedUserId !== activeUserId) return;
  if (accessToken === token) return;
  accessToken = token;
  activeSessionRevision += 1;
  if (activeSessionKnown) sessionListeners.forEach((listener) => listener());
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${API_BASE_PATH}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });
  } catch (err) {
    if (!navigator.onLine) {
      throw new NetworkError('You appear to be offline. Please check your connection.');
    }
    throw new NetworkError('Unable to connect to server. Please try again.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = (typeof data.detail === 'string' ? data.detail : data.detail?.message)
      || data.error?.message
      || 'An error occurred';
    throw new ApiError(message, response.status, data);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string, options?: FetchOptions) =>
    fetchApi<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown, options?: FetchOptions) =>
    fetchApi<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, options?: FetchOptions) =>
    fetchApi<T>(endpoint, { ...options, method: 'DELETE' }),
};

const handledErrors = new WeakSet<object>();

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') handledErrors.add(error);
  if (error instanceof ApiError && error.status < 500) return error.message;
  return fallback;
}

export function isErrorHandled(error: unknown): boolean {
  return error !== null && typeof error === 'object' && handledErrors.has(error);
}

export { ApiError, NetworkError };
