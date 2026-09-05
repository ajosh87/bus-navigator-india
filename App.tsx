import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiKeyProvider } from './src/ApiKeyContext';
import { AuthProvider } from './src/AuthContext';
import { loadSettings } from './src/settingsStore';
import { ToastProvider } from './src/ui';
import { colors } from './src/theme';
import Navigation from './src/navigation';

/** Web-only chrome: load Inter and paint the page ground dark. */
function useWebChrome() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `
      html, body, #root { height: 100%; background: ${colors.background}; }
      body { margin: 0; overscroll-behavior: none; }
      ::selection { background: ${colors.amber}; color: ${colors.ink}; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: ${colors.background}; }
      ::-webkit-scrollbar-thumb {
        background: ${colors.line}; border-radius: 5px;
        border: 2px solid ${colors.background};
      }
      ::-webkit-scrollbar-thumb:hover { background: ${colors.textTertiary}; }
    `;
    document.head.appendChild(style);
  }, []);
}

export default function App() {
  useWebChrome();

  // Hydrate the settings store before any API call reads from it.
  useEffect(() => { void loadSettings(); }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ApiKeyProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <Navigation />
          </ToastProvider>
        </ApiKeyProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
