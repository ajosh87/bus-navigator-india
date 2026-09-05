import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import {
  createBottomTabNavigator, BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, type, space, radius, hairline, CONTENT_MAX_WIDTH } from './theme';
import { useApiKey } from './ApiKeyContext';
import { useAuth } from './AuthContext';
import { navigationRef } from './navigationRef';
import { VoiceLayer } from './voice/VoiceLayer';
import LoginScreen from './screens/LoginScreen';

import TicketsScreen    from './screens/TicketsScreen';
import ScannerScreen    from './screens/ScannerScreen';
import LiveScreen       from './screens/LiveScreen';
import PhrasebookScreen from './screens/PhrasebookScreen';
import RouteScreen      from './screens/RouteScreen';
import SettingsScreen   from './screens/SettingsScreen';
import OnboardingScreen from './screens/OnboardingScreen';

const Tab = createBottomTabNavigator();

const TABS = [
  { name: 'Tickets',  component: TicketsScreen,    icon: 'bookmark'       },
  { name: 'Scan',     component: ScannerScreen,    icon: 'camera'         },
  { name: 'Live',     component: LiveScreen,       icon: 'radio'          },
  { name: 'Speak',    component: PhrasebookScreen, icon: 'message-circle' },
  { name: 'Routes',   component: RouteScreen,      icon: 'map'            },
  { name: 'Settings', component: SettingsScreen,   icon: 'settings'       },
] as const;

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card:       colors.surface,
    text:       colors.text,
    border:     colors.line,
    primary:    colors.amber,
  },
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.barOuter, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={s.barInner}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const tab = TABS.find((t) => t.name === route.name);

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                if (!focused) navigation.navigate(route.name);
              }}
              style={({ pressed }) => [s.tab, pressed && { opacity: 0.6 }]}
            >
              <View style={[s.tabPill, focused && s.tabPillActive]}>
                <Feather
                  name={(tab?.icon ?? 'circle') as any}
                  size={19}
                  color={focused ? colors.amber : colors.textTertiary}
                />
              </View>
              <Text
                style={[
                  type.overline,
                  { color: focused ? colors.amber : colors.textTertiary, marginTop: 5 },
                ]}
              >
                {route.name.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function Navigation() {
  const { ready, onboarded } = useApiKey();
  const { status } = useAuth();

  // Wait for both the stored state and the session check before drawing, so
  // the login screen never flashes for an already-signed-in user.
  if (!ready || status === 'checking') {
    return (
      <View style={s.boot}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  if (status === 'signedOut') return <LoginScreen />;

  if (!onboarded) return <OnboardingScreen />;

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <Tab.Navigator
        tabBar={(props) => <TabBar {...props} />}
        sceneContainerStyle={{ backgroundColor: colors.background }}
        screenOptions={{ headerShown: false }}
      >
        {TABS.map((tab) => (
          <Tab.Screen key={tab.name} name={tab.name} component={tab.component} />
        ))}
      </Tab.Navigator>

      {/* Floats above every tab so any feature is reachable by voice. */}
      <VoiceLayer />
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  boot: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },

  barOuter: {
    backgroundColor: colors.ink,
    borderTopWidth: hairline,
    borderTopColor: colors.line,
    alignItems: 'center',
    paddingTop: space.md,
  },
  barInner: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    paddingHorizontal: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabPill: {
    width: 44, height: 28, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  tabPillActive: { backgroundColor: colors.amberSoft },
});
