import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, type, space, radius, hairline, shadow } from '../theme';
import { Shell, Button, Field, Banner } from '../ui';
import { useAuth } from '../AuthContext';

export default function LoginScreen() {
  const { signIn, configured } = useAuth();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [masked, setMasked]     = useState(true);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);

    if (!password) { setError('Enter your password'); return; }

    setBusy(true);
    try {
      await signIn(username.trim(), password);
      setPassword('');           // don't leave it in component state
    } catch (e: any) {
      setError(e?.message ?? 'Sign-in failed');
      setPassword('');           // force a fresh attempt
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Shell>
          <ScrollView
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.mark}>
              <Feather name="navigation" size={24} color={colors.textInverse} />
            </View>

            <Text style={[type.h1, { color: colors.text }]}>Sign in</Text>
            <Text style={[type.body, s.lede]}>
              This deployment’s Sarvam quota is shared, so access is gated.
            </Text>

            {!configured && (
              <Banner
                tone="warning"
                text="No credentials are configured on the server yet, so sign-in will fail. Run scripts/hash-password.js and set AUTH_PASSWORD_HASH and AUTH_SESSION_SECRET."
              />
            )}

            <View style={s.card}>
              <Text style={[type.overline, { color: colors.textTertiary, marginBottom: space.sm }]}>
                USERNAME
              </Text>
              <Field
                value={username}
                onChangeText={setUsername}
                placeholder="admin"
                icon="user"
                autoCapitalize="none"
              />

              <Text
                style={[
                  type.overline,
                  { color: colors.textTertiary, marginTop: space.lg, marginBottom: space.sm },
                ]}
              >
                PASSWORD
              </Text>
              <Field
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                placeholder="••••••••"
                icon="lock"
                secure={masked}
                autoCapitalize="none"
                onSubmit={submit}
                right={
                  <Pressable onPress={() => setMasked((m) => !m)} style={{ padding: 4 }}>
                    <Feather
                      name={masked ? 'eye' : 'eye-off'}
                      size={16}
                      color={colors.textTertiary}
                    />
                  </Pressable>
                }
              />

              {!!error && (
                <View style={s.errorRow}>
                  <Feather name="alert-circle" size={14} color={colors.danger} />
                  <Text style={[type.meta, { color: colors.danger, marginLeft: 7, flex: 1 }]}>
                    {error}
                  </Text>
                </View>
              )}

              <Button
                label="Sign in"
                icon="log-in"
                onPress={submit}
                loading={busy}
                style={{ marginTop: space.xl }}
              />
            </View>

            <View style={s.noteRow}>
              <Feather name="shield" size={13} color={colors.textTertiary} />
              <Text style={[type.meta, s.note]}>
                Your session is held in an HttpOnly cookie, so page scripts cannot read it.
                Passwords are verified server-side with scrypt and are never stored.
              </Text>
            </View>
          </ScrollView>
        </Shell>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.huge,
    paddingBottom: space.huge,
  },

  mark: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: colors.amber,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.xl,
    ...shadow(2),
  },
  lede: { color: colors.textSecondary, marginTop: space.sm, marginBottom: space.xl },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: hairline, borderColor: colors.line,
    padding: space.xl,
    ...shadow(1),
  },

  errorRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.lg,
  },

  noteRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.xl },
  note: {
    color: colors.textTertiary, marginLeft: 8, flex: 1, lineHeight: 18,
  },
});
