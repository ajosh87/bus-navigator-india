import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { appFetch } from './http';
import { useAuth } from './AuthContext';

const KEY_API        = '@sarvam_api_key';
const KEY_ONBOARDED  = '@onboarded';
const KEY_LANG_PREFS = '@lang_prefs';


export interface LangPrefs {
  /** Language the traveller speaks. */
  mine: string;
  /** Language spoken locally / by the driver. */
  local: string;
}

const DEFAULT_PREFS: LangPrefs = { mine: 'English', local: 'Kannada' };

interface Ctx {
  /**
   * Optional personal Sarvam key, held in memory for this tab only.
   *
   * Deliberately never written to storage: a key in localStorage survives
   * indefinitely and is readable by any script on the page, so it outlives both
   * the session and the user's intent. Reloading clears it.
   */
  apiKey: string;
  /** Synchronous: the key is state only, with nothing to persist. */
  setApiKey: (key: string) => void;
  /** True when the deployment's proxy has a key configured. */
  proxyKeyConfigured: boolean;
  /** True when AI features can actually run, by either route. */
  aiEnabled: boolean;
  /**
   * WebSocket relay for realtime streaming, or null. Present means streaming
   * works with no key in the browser; absent means it needs a personal key.
   */
  relayUrl: string | null;
  /** True when realtime streaming is available by either route. */
  canStream: boolean;
  /** UPI payee for ticket payments, or null when unconfigured. */
  upi: { vpa: string; name: string } | null;
  onboarded: boolean;
  completeOnboarding: () => Promise<void>;
  langPrefs: LangPrefs;
  setLangPrefs: (p: LangPrefs) => Promise<void>;
  /** False until persisted state has loaded — prevents a first-run UI flash. */
  ready: boolean;
}

const ApiKeyContext = createContext<Ctx>({
  apiKey: '',
  setApiKey: () => {},
  proxyKeyConfigured: false,
  aiEnabled: false,
  relayUrl: null,
  canStream: false,
  upi: null,
  onboarded: false,
  completeOnboarding: async () => {},
  langPrefs: DEFAULT_PREFS,
  setLangPrefs: async () => {},
  ready: false,
});

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus } = useAuth();
  const [apiKey, setKeyState] = useState('');
  const [onboarded, setOnb]   = useState(false);
  const [langPrefs, setPrefs] = useState<LangPrefs>(DEFAULT_PREFS);
  const [ready, setReady]     = useState(false);
  const [proxyKey, setProxy]  = useState(false);
  const [relayUrl, setRelay]  = useState<string | null>(null);
  const [upi, setUpi]         = useState<{ vpa: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [onb, prefs] = await AsyncStorage.multiGet([KEY_ONBOARDED, KEY_LANG_PREFS]);
      if (onb[1] === '1') setOnb(true);
      if (prefs[1]) {
        try { setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(prefs[1]) }); } catch {}
      }
      // Purge any key persisted by an earlier build — keys are session-only now.
      await AsyncStorage.removeItem(KEY_API).catch(() => {});
      setReady(true);
    })();
  }, []);

  // Probe the backend separately so a slow or missing one never blocks boot.
  // Re-runs on sign-in because the relay URL and UPI payee are only returned to
  // an authenticated caller.
  useEffect(() => {
    if (authStatus !== 'signedIn') {
      setProxy(false);
      setRelay(null);
      setUpi(null);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const res = await appFetch('/api/health');
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        setProxy(Boolean(json?.keyConfigured));
        setRelay(typeof json?.relayUrl === 'string' ? json.relayUrl : null);
        setUpi(
          json?.upi && typeof json.upi.vpa === 'string'
            ? { vpa: json.upi.vpa, name: String(json.upi.name ?? 'Ticket Concierge') }
            : null,
        );
      } catch { /* offline, or running without the serverless backend */ }
    })();
    return () => { alive = false; };
  }, [authStatus]);

  /** In-memory only — intentionally not written to storage. */
  const setApiKey = (key: string) => setKeyState(key);

  const completeOnboarding = async () => {
    setOnb(true);
    await AsyncStorage.setItem(KEY_ONBOARDED, '1');
  };

  const setLangPrefs = async (p: LangPrefs) => {
    setPrefs(p);
    await AsyncStorage.setItem(KEY_LANG_PREFS, JSON.stringify(p));
  };

  return (
    <ApiKeyContext.Provider
      value={{
        apiKey, setApiKey,
        proxyKeyConfigured: proxyKey,
        aiEnabled: proxyKey || apiKey.length > 0,
        relayUrl,
        // The relay carries the key itself; a personal key can go direct.
        canStream: Boolean(relayUrl) || apiKey.length > 0,
        upi,
        onboarded, completeOnboarding,
        langPrefs, setLangPrefs,
        ready,
      }}
    >
      {children}
    </ApiKeyContext.Provider>
  );
}

export const useApiKey = () => useContext(ApiKeyContext);
