import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, type, space, radius, hairline, shadow } from '../theme';
import { Shell, Button, Banner } from '../ui';
import { useApiKey } from '../ApiKeyContext';

const CAPABILITIES = [
  {
    icon: 'camera',
    title: 'Scan any signboard',
    body: 'Point at a bus board in Kannada, Tamil or Hindi — read it in your language.',
  },
  {
    icon: 'radio',
    title: 'Talk, live',
    body: 'Two-way conversation with a driver, translated and spoken out loud as you go.',
  },
  {
    icon: 'map',
    title: 'Look up routes',
    body: 'Search BMTC route numbers and see every stop along the way.',
  },
] as const;

export default function OnboardingScreen() {
  const { completeOnboarding, proxyKeyConfigured } = useApiKey();

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <Shell>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.mark}>
            <Feather name="navigation" size={26} color={colors.textInverse} />
          </View>

          <Text style={[type.display, s.title]}>Ride anywhere in India</Text>
          <Text style={[type.body, s.lede]}>
            Read bus boards, talk to drivers and find routes — across all 22 official
            Indian languages.
          </Text>

          <View style={s.caps}>
            {CAPABILITIES.map((c) => (
              <View key={c.title} style={s.capRow}>
                <View style={s.capIcon}>
                  <Feather name={c.icon as any} size={16} color={colors.amber} />
                </View>
                <View style={s.flex}>
                  <Text style={[type.label, { color: colors.text }]}>{c.title}</Text>
                  <Text style={[type.meta, { color: colors.textSecondary, marginTop: 3 }]}>
                    {c.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {proxyKeyConfigured ? (
            <View style={s.readyRow}>
              <Feather name="shield" size={14} color={colors.success} />
              <Text style={[type.meta, { color: colors.textSecondary, marginLeft: 8, flex: 1 }]}>
                Ready to go — no setup, no API key needed.
              </Text>
            </View>
          ) : (
            <Banner
              tone="warning"
              text="AI features are offline: this deployment has no Sarvam key configured. Route search still works."
            />
          )}

          <Button label="Get started" icon="arrow-right" onPress={completeOnboarding} />
        </ScrollView>
      </Shell>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  flex:    { flex: 1 },
  content: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.huge },

  mark: {
    width: 56, height: 56, borderRadius: radius.lg,
    backgroundColor: colors.amber,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.xl,
    ...shadow(2),
  },
  title: { color: colors.text, marginBottom: space.md },
  lede:  { color: colors.textSecondary, marginBottom: space.xxl },

  caps:   { marginBottom: space.xl },
  capRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.xl },
  capIcon: {
    width: 34, height: 34, borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    alignItems: 'center', justifyContent: 'center',
    marginRight: space.lg,
  },

  readyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: hairline, borderColor: colors.line,
    padding: space.lg,
    marginBottom: space.xl,
  },
});
