import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';

import { colors, type, space, radius, hairline, shadow } from '../theme';
import {
  Screen, Header, Card, SectionLabel, Button, Field,
  Banner, EmptyState, Skeleton, useToast,
} from '../ui';
import { DEMO_ROUTES } from '../languages';
import { searchBmtcRoute, RouteResult } from '../api';
import { TransitMap } from './TransitMap';

const POPULAR = Object.keys(DEMO_ROUTES);

type Mode = 'search' | 'map';

export default function RouteScreen() {
  const toast = useToast();
  const params = useRoute().params as
    | { routeNo?: string; mode?: Mode }
    | undefined;

  const [mode, setMode]       = useState<Mode>('search');
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RouteResult[]>([]);
  const [searched, setSearched] = useState('');
  const [curated, setCurated] = useState(false);

  const search = async (routeNo: string) => {
    const rn = routeNo.trim().toUpperCase();
    if (!rn) return;
    setQuery(rn);
    setLoading(true);
    setResults([]);
    setSearched(rn);
    setCurated(false);
    try {
      const live = await searchBmtcRoute(rn);
      if (live.length > 0) setResults(live);
      else fallback(rn);
    } catch {
      fallback(rn);
    } finally {
      setLoading(false);
    }
  };

  const fallback = (rn: string) => {
    const demo = DEMO_ROUTES[rn];
    if (demo) {
      setResults([demo]);
      setCurated(true);
    } else {
      setResults([]);
      setCurated(false);
      toast(`No stored data for route ${rn}`, 'error');
    }
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setSearched('');
    setCurated(false);
  };

  // Voice commands arrive as navigation params ("find route 500D", "show map").
  const lastHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!params) return;
    const token = `${params.mode ?? ''}:${params.routeNo ?? ''}`;
    if (token === ':' || lastHandled.current === token) return;
    lastHandled.current = token;

    if (params.mode) setMode(params.mode);
    if (params.routeNo) void search(params.routeNo);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const modeToggle = (
    <View style={s.modeRow}>
      {([['search', 'Search', 'search'], ['map', 'Map', 'map']] as const).map(
        ([id, label, icon]) => (
          <Pressable
            key={id}
            onPress={() => setMode(id)}
            style={[s.modeItem, mode === id && s.modeItemActive]}
          >
            <Feather
              name={icon}
              size={13}
              color={mode === id ? colors.textInverse : colors.textSecondary}
            />
            <Text
              style={[
                type.meta,
                { color: mode === id ? colors.textInverse : colors.textSecondary, marginLeft: 6 },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );

  // The map owns its own gestures, so it must not sit inside a ScrollView.
  if (mode === 'map') {
    return (
      <Screen>
        <Header
          title="Transit map"
          subtitle={searched ? `Route ${searched} · live where available` : 'Routes, metro and live buses'}
        />
        {modeToggle}
        <TransitMap focusRoute={searched || undefined} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Header title="Routes" subtitle="BMTC Bengaluru · live with offline backup" />

      {modeToggle}

      {/* Search */}
      <View style={s.searchRow}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Route number — 500D"
          icon="search"
          autoCapitalize="characters"
          onSubmit={() => search(query)}
          style={s.flex}
          right={
            query.length > 0 ? (
              <Pressable onPress={clear} style={{ padding: 4 }}>
                <Feather name="x" size={15} color={colors.textTertiary} />
              </Pressable>
            ) : undefined
          }
        />
        <Button
          label="Find"
          onPress={() => search(query)}
          loading={loading}
          disabled={!query.trim()}
          compact
          style={{ height: 50, paddingHorizontal: space.xl }}
        />
      </View>

      {/* Popular */}
      <SectionLabel>Popular routes</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.popRow}>
        {POPULAR.map((rt) => {
          const active = searched === rt;
          return (
            <Pressable
              key={rt}
              onPress={() => search(rt)}
              style={({ pressed }) => [s.popCard, active && s.popCardActive, pressed && { opacity: 0.75 }]}
            >
              <Text style={[type.h3, { color: active ? colors.textInverse : colors.amber }]}>{rt}</Text>
              <Text
                style={[
                  type.meta,
                  { color: active ? 'rgba(11,14,19,0.7)' : colors.textTertiary, marginTop: 2 },
                ]}
                numberOfLines={1}
              >
                {DEMO_ROUTES[rt].dest}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Loading */}
      {loading && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <Skeleton height={54} width={54} />
            <View style={{ flex: 1, gap: space.sm }}>
              <Skeleton height={13} width="55%" />
              <Skeleton height={13} width="75%" />
            </View>
          </View>
          <View style={{ gap: space.md, marginTop: space.xl }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} height={13} width={`${88 - i * 9}%`} />)}
          </View>
        </Card>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <>
          {curated && (
            <Banner tone="info" text="Live BMTC feed unreachable — showing stored timetable data." />
          )}
          {results.map((r, i) => <RouteCard key={i} routeNo={searched} route={r} />)}
        </>
      )}

      {/* Nothing searched yet */}
      {!loading && !searched && (
        <EmptyState
          icon="map"
          title="Find any BMTC route"
          body="Enter a route number to see its origin, destination and every stop in between. No API key needed."
        />
      )}

      {/* Searched but empty */}
      {!loading && !!searched && results.length === 0 && (
        <EmptyState
          icon="alert-circle"
          title={`Route ${searched} not found`}
          body="Check the number, or try one of the popular routes above."
          action={<Button label="Clear search" variant="secondary" onPress={clear} />}
        />
      )}
    </Screen>
  );
}

// ─── route card ───────────────────────────────────────────────────────────────

function RouteCard({ routeNo, route }: { routeNo: string; route: RouteResult }) {
  const [expanded, setExpanded] = useState(true);
  const stops = route.stops ?? [];

  return (
    <Card padded={false} style={s.routeCard}>
      {/* Board-style header */}
      <View style={s.routeHead}>
        <View style={s.badge}>
          <Text style={[type.numeric, { color: colors.textInverse }]} numberOfLines={1}>
            {routeNo}
          </Text>
        </View>

        <View style={{ flex: 1, marginLeft: space.lg }}>
          <Text style={[type.meta, { color: colors.textTertiary }]} numberOfLines={1}>
            {route.origin}
          </Text>
          <View style={s.arrowRow}>
            <View style={s.arrowDot} />
            <View style={s.arrowLine} />
            <Feather name="chevron-right" size={12} color={colors.amber} />
          </View>
          <Text style={[type.h3, { color: colors.text }]} numberOfLines={2}>
            {route.dest}
          </Text>
        </View>
      </View>

      {/* Meta strip */}
      {(route.fare || route.frequency || stops.length > 0) && (
        <View style={s.metaStrip}>
          {!!route.fare && <Meta icon="credit-card" label={route.fare} />}
          {!!route.frequency && <Meta icon="clock" label={route.frequency} />}
          {stops.length > 0 && <Meta icon="map-pin" label={`${stops.length} stops`} />}
        </View>
      )}

      {/* Stops */}
      {stops.length > 0 && (
        <>
          <Pressable style={s.toggle} onPress={() => setExpanded((e) => !e)}>
            <Text style={[type.overline, { color: colors.textTertiary }]}>ALL STOPS</Text>
            <Feather
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={colors.textTertiary}
            />
          </Pressable>

          {expanded && (
            <View style={s.timeline}>
              {stops.map((stop, i) => {
                const terminal = i === 0 || i === stops.length - 1;
                const last = i === stops.length - 1;
                return (
                  <View key={`${stop}-${i}`} style={s.stopRow}>
                    <View style={s.rail}>
                      <View style={[s.dot, terminal && s.dotTerminal]} />
                      {!last && <View style={s.railLine} />}
                    </View>
                    <Text
                      style={[
                        terminal ? type.label : type.body,
                        { color: terminal ? colors.text : colors.textSecondary, flex: 1, paddingBottom: space.lg },
                      ]}
                    >
                      {stop}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

function Meta({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={s.meta}>
      <Feather name={icon} size={12} color={colors.textTertiary} />
      <Text style={[type.meta, { color: colors.textSecondary, marginLeft: 5 }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },

  modeRow: {
    flexDirection: 'row',
    marginHorizontal: space.xl, marginBottom: space.lg,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.full,
    padding: 3,
    borderWidth: hairline, borderColor: colors.line,
  },
  modeItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: radius.full,
  },
  modeItemActive: { backgroundColor: colors.amber },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingHorizontal: space.xl, marginBottom: space.sm,
  },

  popRow: { paddingHorizontal: space.xl, gap: space.md, paddingBottom: space.lg },
  popCard: {
    minWidth: 118, paddingHorizontal: space.lg, paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: hairline, borderColor: colors.line,
  },
  popCardActive: { backgroundColor: colors.amber, borderColor: colors.amber },

  routeCard: { overflow: 'hidden' },
  routeHead: { flexDirection: 'row', alignItems: 'center', padding: space.lg },
  badge: {
    minWidth: 62, height: 54, paddingHorizontal: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.amber,
    alignItems: 'center', justifyContent: 'center',
    ...shadow(1),
  },
  arrowRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 5 },
  arrowDot:  { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.amber },
  arrowLine: { flex: 1, height: hairline, backgroundColor: colors.amberLine, marginHorizontal: 4 },

  metaStrip: {
    flexDirection: 'row', flexWrap: 'wrap', gap: space.lg,
    paddingHorizontal: space.lg, paddingBottom: space.lg,
  },
  meta: { flexDirection: 'row', alignItems: 'center' },

  toggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderTopWidth: hairline, borderTopColor: colors.lineSoft,
    backgroundColor: colors.surfaceHi,
  },
  timeline: { paddingHorizontal: space.lg, paddingTop: space.lg },
  stopRow:  { flexDirection: 'row', alignItems: 'flex-start' },
  rail:     { width: 22, alignItems: 'center' },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.surfacePressed,
    borderWidth: 1.5, borderColor: colors.line,
    marginTop: 5,
  },
  dotTerminal: {
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: colors.amber, borderColor: colors.amber,
    marginTop: 4,
  },
  railLine: { width: 1.5, flex: 1, backgroundColor: colors.line, marginTop: 2 },
});
