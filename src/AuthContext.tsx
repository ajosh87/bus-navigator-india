import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';

import { appFetch, onUnauthorized } from './http';

/**
 * Client-side auth state.
 *
 * This is a mirror, not the authority. The session lives in an HttpOnly cookie
 * that JavaScript cannot read, and every protected endpoint verifies it
 * server-side — so tampering with anything here only changes what the UI draws,
 * never what the backend will do.
 */

export type AuthStatus = 'checking' | 'signedOut' | 'signedIn';

interface Ctx {
  status: AuthStatus;
  user: string | null;
  /** False when the deployment has no credentials set, so nobody can sign in. */
  configured: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<Ctx>({
  status: 'checking',
  user: null,
  configured: false,
  signIn: async () => {},
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await appFetch('/api/auth/session');
      if (!res.ok) { setStatus('signedOut'); return; }
      const json = await res.json();
      setConfigured(Boolean(json?.configured));
      if (json?.authenticated) {
        setUser(typeof json.user === 'string' ? json.user : null);
        setStatus('signedIn');
      } else {
        setUser(null);
        setStatus('signedOut');
      }
    } catch {
      // Offline, or the backend is not being served at all.
      setStatus('signedOut');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Any 401 from anywhere in the app drops us back to the login screen.
  useEffect(
    () => onUnauthorized(() => { setUser(null); setStatus('signedOut'); }),
    [],
  );

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await appFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON error page */ }

    if (!res.ok) {
      throw new Error(payload?.error ?? `Sign-in failed (${res.status})`);
    }

    setUser(payload?.user ?? username);
    setConfigured(true);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await appFetch('/api/auth/logout', { method: 'POST' });
    } catch { /* clear locally regardless */ }
    setUser(null);
    setStatus('signedOut');
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, configured, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
