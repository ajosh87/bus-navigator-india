import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, type, space, radius, hairline } from '../theme';
import { Chip, Banner } from '../ui';
import { MapView, MapMarker, MapPolyline, LatLon } from '../MapView';
import {
  CITIES, ROUTE_STOPS, Vehicle, VehicleFeed, FeedUnavailable,
  cityById, fetchVehicles, metroLinesFor,
} from '../transit';

/** How often live positions are re-fetched while the map is on screen. */
const REFRESH_MS = 15_000;

type LayerId = 'route' | 'metro' | 'live';

export function TransitMap({ focusRoute }: { focusRoute?: string }) {
  const [cityId, setCityId] = useState('bengaluru');
  const [center, setCenter] = useState<LatLon>(cityById('bengaluru').center);
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({
    route: true, metro: true, live: true,
  });

  const [feed, setFeed] = useState<VehicleFeed | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loadingFeed, setLoading] = useState(false);

  const city = cityById(cityId);
  const routeStops = focusRoute ? ROUTE_STOPS[focusRoute] : undefined;

  // Follow the searched route when there is one, otherwise sit on the city.
  useEffect(() => {
    if (routeStops?.length) {
      const mid = routeStops[Math.floor(routeStops.length / 2)];
      setCenter({ lat: mid.lat, lon: mid.lon });
    } else {
      setCenter(city.center);
    }
  }, [cityId, focusRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const loadFeed = useCallback(async () => {
    if (!layers.live) return;

    // Skip the request entirely where no feed exists, rather than making the
    // server say no fifteen times a minute.
    if (!city.liveBuses) {
      setFeed(null);
      setFeedError(
        `No public real-time bus feed exists for ${city.name}. Showing routes and stops only.`,
      );
      return;
    }

    setLoading(true);
    try {
      const next = await fetchVehicles(cityId);
      if (!alive.current) return;
      setFeed(next);
      setFeedError(null);
    } catch (e: any) {
      if (!alive.current) return;
      setFeed(null);
      setFeedError(
        e instanceof FeedUnavailable ? e.message : (e?.message ?? 'Live feed unavailable'),
      );
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [cityId, city.liveBuses, city.name, layers.live]);

  useEffect(() => {
    void loadFeed();
    if (!layers.live || !city.liveBuses) return;
    const timer = setInterval(() => { void loadFeed(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadFeed, layers.live, city.liveBuses]);

  const metroLines = useMemo(() => metroLinesFor(cityId), [cityId]);

  const polylines = useMemo<MapPolyline[]>(() => {
    const out: MapPolyline[] = [];

    if (layers.metro) {
      for (const line of metroLines) {
        out.push({ id: line.id, points: line.stations, color: line.colorHex, width: 3 });
      }
    }
    if (layers.route && routeStops?.length) {
      out.push({ id: `route-${focusRoute}`, points: routeStops, color: colors.amber, width: 4 });
    }
    return out;
  }, [layers.metro, layers.route, metroLines, routeStops, focusRoute]);

  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];

    if (layers.metro) {
      for (const line of metroLines) {
        for (const st of line.stations) {
          out.push({
            id: `${line.id}-${st.name}`,
            lat: st.lat, lon: st.lon,
            color: line.colorHex,
            icon: 'circle',
          });
        }
      }
    }

    if (layers.route && routeStops?.length) {
      routeStops.forEach((st, i) => {
        const terminal = i === 0 || i === routeStops.length - 1;
        out.push({
          id: `stop-${focusRoute}-${i}`,
          lat: st.lat, lon: st.lon,
          color: colors.amber,
          icon: terminal ? 'map-pin' : undefined,
          label: terminal ? st.name : undefined,
        });
      });
    }

    if (layers.live && feed) {
      for (const v of feed.vehicles) {
        out.push({
          id: `veh-${v.id}`,
          lat: v.lat, lon: v.lon,
          color: colors.teal,
          bearing: v.bearing,
        });
      }
    }

    return out;
  }, [layers, metroLines, routeStops, focusRoute, feed]);

  const toggle = (id: LayerId) =>
    setLayers((l) => ({ ...l, [id]: !l[id] }));

  return (
    <View style={s.root}>
      {/* City */}
      <View style={s.cityRow}>
        {CITIES.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            icon={c.liveBuses ? 'radio' : 'map'}
            selected={c.id === cityId}
            onPress={() => setCityId(c.id)}
          />
        ))}
      </View>

      <MapView
        center={center}
        zoom={focusRoute ? 11 : 12}
        markers={markers}
        polylines={polylines}
        onCenterChange={setCenter}
        style={s.map}
      />

      {/* Layers */}
      <View style={s.layerRow}>
        <LayerToggle
          label={focusRoute ? `Route ${focusRoute}` : 'Route'}
          icon="git-commit"
          on={layers.route}
          disabled={!routeStops?.length}
          onPress={() => toggle('route')}
        />
        <LayerToggle label="Metro" icon="git-merge" on={layers.metro} onPress={() => toggle('metro')} />
        <LayerToggle label="Live buses" icon="radio" on={layers.live} onPress={() => toggle('live')} />
      </View>

      {/* Honest status about what the map is actually showing */}
      <View style={s.status}>
        {loadingFeed && (
          <View style={s.statusRow}>
            <ActivityIndicator size="small" color={colors.textTertiary} />
            <Text style={[type.meta, s.statusText]}>Fetching live positions…</Text>
          </View>
        )}

        {!loadingFeed && feed && (
          <View style={s.statusRow}>
            <View style={s.liveDot} />
            <Text style={[type.meta, s.statusText]}>
              {feed.vehicles.length} buses live · {feed.source}
            </Text>
          </View>
        )}

        {!loadingFeed && !feed && !!feedError && layers.live && (
          <Banner tone="info" text={feedError} />
        )}

        {layers.metro && metroLines.length > 0 && (
          <View style={s.statusRow}>
            <Feather name="clock" size={12} color={colors.textTertiary} />
            <Text style={[type.meta, s.statusText]}>
              Metro shown as scheduled, not tracked — no Indian metro publishes live train
              positions. {metroLines.map((l) => `${l.name} ${l.headway}`).join(' · ')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function LayerToggle({
  label, icon, on, disabled, onPress,
}: {
  label: string;
  icon: any;
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[s.layer, on && !disabled && s.layerOn, disabled && { opacity: 0.4 }]}
    >
      <Feather
        name={icon}
        size={13}
        color={on && !disabled ? colors.amber : colors.textTertiary}
      />
      <Text
        style={[
          type.meta,
          { color: on && !disabled ? colors.amber : colors.textSecondary, marginLeft: 6 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  cityRow: {
    flexDirection: 'row', gap: space.sm,
    paddingHorizontal: space.xl, paddingBottom: space.md,
  },

  map: {
    flex: 1,
    marginHorizontal: space.xl,
    borderRadius: radius.lg,
    borderWidth: hairline, borderColor: colors.line,
    minHeight: 260,
  },

  layerRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: space.sm,
    paddingHorizontal: space.xl, paddingTop: space.md,
  },
  layer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.md, paddingVertical: 7,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.full,
    borderWidth: hairline, borderColor: colors.line,
  },
  layerOn: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },

  status: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.sm },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start' },
  statusText: { color: colors.textTertiary, marginLeft: 7, flex: 1 },
  liveDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.success, marginTop: 4,
  },
});
