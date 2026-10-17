import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, getActiveUserId, setActiveSession, subscribeActiveSession } from '@/lib/api';
import { applySessionToken } from '@/lib/hooks/use-session-token';

afterEach(() => setActiveSession(null, null));

describe('active API session', () => {
  it('ignores token synchronization from a detached account after switching or signing out', () => {
    const previousSession = { user: { id: 'user-a' }, accessToken: 'token-a', expires: '' };
    setActiveSession('user-b', 'token-b');
    applySessionToken(previousSession);
    expect(getAccessToken()).toBe('token-b');
    setActiveSession(null, null);
    applySessionToken(previousSession);
    expect(getAccessToken()).toBeNull();
  });

  it('notifies subscribers only after the identity and token are changed together', () => {
    setActiveSession('user-a', 'token-a');
    const changed = vi.fn(() => ({ owner: getActiveUserId(), token: getAccessToken() }));
    const unsubscribe = subscribeActiveSession(changed);
    setActiveSession('user-b', 'token-b');
    expect(changed).toHaveReturnedWith({ owner: 'user-b', token: 'token-b' });
    setActiveSession('user-b', 'token-b');
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    setActiveSession(null, null);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(getActiveUserId()).toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});
