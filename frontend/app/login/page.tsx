'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { signIn, getProviders, getSession, useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthFrame } from '@/components/auth-frame';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { API_BASE_PATH } from '@/lib/api';
import { safeCallbackUrl } from '@/lib/callback-url';
import {
  FORWARD_AUTH_ACCOUNT_CONFLICT,
  FORWARD_AUTH_SERVER_ERROR,
  FORWARD_AUTH_USERNAME_CONFLICT,
  SESSION_REAUTH_REQUIRED,
} from '@/lib/auth-errors';
import { useAuthConfig } from '@/lib/hooks/use-auth-config';

function OIDCLoginButton({ getCallbackUrl }: { getCallbackUrl: () => string }) {
  const t = useTranslations('auth');

  return (
    <Button
      onClick={() => signIn('oidc', { callbackUrl: getCallbackUrl() })}
      className="flex w-full items-center justify-center gap-3 rounded-md bg-primary px-4 py-3 text-primary-foreground hover:bg-primary/90 transition-colors"
    >
      <UserRound className="h-5 w-5" />
      {t('title')}
    </Button>
  );
}

function DevLogin({ getCallbackUrl }: { getCallbackUrl: () => string }) {
  const [email, setEmail] = useState('dev@wardrobe.local');
  const [name, setName] = useState('Dev User');
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('auth');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await signIn('dev-credentials', {
      email,
      name,
      callbackUrl: getCallbackUrl(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
        {t('devMode')}
      </div>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">
          {t('email')}
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="dev@example.com"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium">
          {t('displayName')}
        </label>
        <Input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t('namePlaceholder')}
        />
      </div>
      <Button
        type="submit"
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('signingIn')}
          </>
        ) : (
          t('title')
        )}
      </Button>
    </form>
  );
}

type ForwardSignInState = 'idle' | 'signingIn' | 'failed';
type ForwardFailure = 'headers' | 'server' | 'conflict' | 'usernameConflict';

const FORWARD_FAILURE_MESSAGES = {
  headers: 'forwardAuth.headersMissing',
  server: 'forwardAuth.serverError',
  conflict: 'forwardAuth.accountConflict',
  usernameConflict: 'forwardAuth.usernameConflict',
} as const;

function forwardFailureFor(errorCode: string | null | undefined): ForwardFailure {
  if (errorCode === FORWARD_AUTH_SERVER_ERROR) return 'server';
  if (errorCode === FORWARD_AUTH_ACCOUNT_CONFLICT) return 'conflict';
  if (errorCode === FORWARD_AUTH_USERNAME_CONFLICT) return 'usernameConflict';
  return 'headers';
}

// Lives in LoginContent rather than ForwardLogin so that the one-shot guard survives the
// skeleton swapping ForwardLogin out while the session reloads.
function useForwardSignIn(auto: boolean) {
  const [state, setState] = useState<ForwardSignInState>('idle');
  const [failure, setFailure] = useState<ForwardFailure | null>(null);
  const attempted = useRef(false);

  const signInThroughProxy = useCallback(async () => {
    setState('signingIn');
    // redirect: false keeps a failure on this page; a redirect would go through
    // pages.error ('/login?error=...') and lose the reason.
    const result = await signIn('forward-auth', { redirect: false });
    if (!result?.ok || result.error) {
      setFailure(forwardFailureFor(result?.error));
      setState('failed');
      return;
    }
    // Success normally ends on the redirect effect, which waits for an accessToken. A logout or
    // proxy user switch in another tab can clear the new cookie first, and the button must not
    // stay disabled then.
    const session = await getSession();
    if (!session?.accessToken) setState('idle');
  }, []);

  useEffect(() => {
    if (!auto || attempted.current) return;
    attempted.current = true;
    void signInThroughProxy();
  }, [auto, signInThroughProxy]);

  return { state, failure, signInThroughProxy };
}

function ForwardLogin({
  state,
  failure,
  loggedOut,
  onSignIn,
}: {
  state: ForwardSignInState;
  failure: ForwardFailure | null;
  loggedOut: boolean;
  onSignIn: () => void;
}) {
  const t = useTranslations('auth');

  return (
    <div className="space-y-4">
      {failure && state !== 'signingIn' && (
        <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
          {t(FORWARD_FAILURE_MESSAGES[failure])}
        </div>
      )}
      {loggedOut && !failure && state === 'idle' && (
        <p className="text-center text-sm text-muted-foreground">{t('forwardAuth.signedOut')}</p>
      )}
      <Button
        type="button"
        onClick={onSignIn}
        disabled={state === 'signingIn'}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {state === 'signingIn' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('signingIn')}
          </>
        ) : (
          t('forwardAuth.continue')
        )}
      </Button>
    </div>
  );
}

function BackendError({ message }: { message: string }) {
  const t = useTranslations('auth');

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm space-y-2">
      <p className="font-medium text-destructive">{t('backendError.title')}</p>
      <p className="text-destructive/90">{message}</p>
    </div>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const error = searchParams.get('error');
  const syncErrorParam = searchParams.get('syncError');
  const loggedOut = searchParams.get('loggedOut') === '1';
  const callbackParam = searchParams.get('callbackUrl');
  // Resolved on use rather than during render, because the page is server-rendered too and
  // the same-origin check needs window.location.
  const getCallbackUrl = useCallback(
    () => safeCallbackUrl(callbackParam, window.location.origin),
    [callbackParam]
  );
  const [backendError, setBackendError] = useState<string | null>(null);
  const t = useTranslations('auth');

  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      router.push(getCallbackUrl());
    }
  }, [status, session?.accessToken, getCallbackUrl, router]);

  // Check backend auth configuration on mount
  useEffect(() => {
    fetch(`${API_BASE_PATH}/auth/status`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.configured && data.error) {
          setBackendError(data.error);
        }
      })
      .catch(() => {
        setBackendError(t('backendError.description'));
      });
  }, [t]);

  const syncError = syncErrorParam || session?.syncError;

  const [providerMode, setProviderMode] = useState<'loading' | 'oidc' | 'dev' | 'unconfigured'>('loading');
  const authConfig = useAuthConfig();

  useEffect(() => {
    getProviders().then((providers) => {
      if (providers?.['oidc']) {
        setProviderMode('oidc');
      } else if (providers?.['dev-credentials']) {
        setProviderMode('dev');
      } else {
        setProviderMode('unconfigured');
      }
    });
  }, []);

  const authMode = authConfig.isPending
    ? 'loading'
    : authConfig.data?.forward_auth
      ? 'forward'
      : providerMode;

  const forward = useForwardSignIn(
    authMode === 'forward' && status === 'unauthenticated' && !error && !loggedOut
  );

  if (status === 'loading' || authMode === 'loading') {
    return (
      <div className="space-y-4 animate-pulse">
        <Skeleton className="h-12 w-full rounded-md" />
      </div>
    );
  }

  return (
    <>
      {backendError && <BackendError message={backendError} />}

      {!backendError && syncError && (syncError === SESSION_REAUTH_REQUIRED
        ? <p role="alert" className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">{t('errors.sessionExpired')}</p>
        : <BackendError message={syncError} />)}

      {error && authMode !== 'forward' && !backendError && !syncError && (
        <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">
          {error === 'OAuthSignin' && t('errors.OAuthSignin')}
          {error === 'OAuthCallback' && t('errors.OAuthCallback')}
          {error === 'OAuthCreateAccount' && t('errors.OAuthCreateAccount')}
          {error === 'Callback' && t('errors.Callback')}
          {error === 'CredentialsSignin' && t('errors.CredentialsSignin')}
          {error === 'AccessDenied' && t('errors.AccessDenied')}
          {error === 'undefined' && t('errors.notConfigured')}
          {!['OAuthSignin', 'OAuthCallback', 'OAuthCreateAccount', 'Callback', 'CredentialsSignin', 'AccessDenied', 'undefined'].includes(error) && t('errors.default')}
        </div>
      )}

      <div className="space-y-4">
        {authMode === 'forward' && (
          <ForwardLogin
            state={forward.state}
            failure={
              forward.state === 'failed' ? forward.failure : error ? forwardFailureFor(error) : null
            }
            loggedOut={loggedOut}
            onSignIn={forward.signInThroughProxy}
          />
        )}
        {authMode === 'oidc' && <OIDCLoginButton getCallbackUrl={getCallbackUrl} />}
        {authMode === 'dev' && <DevLogin getCallbackUrl={getCallbackUrl} />}
        {authMode === 'unconfigured' && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm space-y-2">
            <p className="font-medium text-destructive">{t('unconfigured.title')}</p>
            <p className="text-destructive/90">
              {t.rich('unconfigured.description', {
                code: (chunks) => <code className="font-mono">{chunks}</code>,
              })}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export default function LoginPage() {
  const t = useTranslations('auth');

  return (
    <AuthFrame title={t('title')} subtitle={t('subtitle')} caption={t('tagline')}>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <LoginContent />
      </Suspense>
      <p className="mt-8 text-center text-xs leading-6 text-muted-foreground">{t('termsAgreement')}</p>
    </AuthFrame>
  );
}
