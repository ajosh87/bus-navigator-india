import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, PanResponder, Pressable,
  LayoutChangeEvent, ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors, type, space, radius, hairline } from './theme';

/**
 * A small slippy map built on RN primitives.
 *
 * Deliberately dependency-free: Leaflet is a DOM library that would need a
 * web-only fork plus a CSS file Metro cannot bundle, and the native map
 * packages need config plugins and a rebuild. Raster tiles in <Image> with a
 * PanResponder work identically on both platforms and cost nothing.
 */

const TILE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

/**
 * OpenStreetMap's own tiles — the only genuinely key-free option. CARTO's dark
 * basemap looks better against this palette but now stamps "API KEY REQUIRED"
 * diagonally across unauthenticated tiles.
 *
 * OSM's tile policy is aimed at modest use; anything with real traffic should
 * move to a paid provider (or self-host) rather than lean on their donated
 * bandwidth.
 */
const TILE_URL = (z: number, x: number, y: number) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

/**
 * OSM tiles are light. Rather than a CSS filter (which RN styles do not carry
 * to native), they are dimmed against the ink background and given a scrim, so
 * the map recedes behind the route overlay instead of glaring.
 */
const TILE_OPACITY = 0.62;

export interface LatLon { lat: number; lon: number }

export interface MapPolyline {
  id: string;
  points: LatLon[];
  color?: string;
  width?: number;
}

export interface MapMarker extends LatLon {
  id: string;
  /** Feather icon name; omitted markers render as a dot. */
  icon?: keyof typeof Feather.glyphMap;
  color?: string;
  label?: string;
  /** Draws a heading arrow when present (degrees clockwise from north). */
  bearing?: number;
  onPress?: () => void;
}

// ─── Web Mercator ────────────────────────────────────────────────────────────

function lonToWorldX(lon: number, scale: number): number {
  return ((lon + 180) / 360) * scale;
}

function latToWorldY(lat: number, scale: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
}

function worldXToLon(x: number, scale: number): number {
  return (x / scale) * 360 - 180;
}

function worldYToLat(y: number, scale: number): number {
  const n = Math.PI - 2 * Math.PI * (y / scale);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function MapView({
  center,
  zoom = 12,
  markers = [],
  polylines = [],
  style,
  onCenterChange,
  showAttribution = true,
}: {
  center: LatLon;
  zoom?: number;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  style?: ViewStyle;
  onCenterChange?: (c: LatLon) => void;
  showAttribution?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [level, setLevel] = useState(zoom);

  /**
   * Pan is tracked as a pixel offset applied on top of `center`, then folded
   * back into a lat/lon on release. Recomputing the projection on every drag
   * frame would be both slower and lossier.
   */
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ x: 0, y: 0 });
  const centerRef = useRef(center);
  centerRef.current = center;
  const levelRef = useRef(level);
  levelRef.current = level;

  const scale = TILE * Math.pow(2, level);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderMove: (_e, g) => {
        dragRef.current = { x: g.dx, y: g.dy };
        setDrag(dragRef.current);
      },
      onPanResponderRelease: () => {
        const s = TILE * Math.pow(2, levelRef.current);
        const cx = lonToWorldX(centerRef.current.lon, s) - dragRef.current.x;
        const cy = latToWorldY(centerRef.current.lat, s) - dragRef.current.y;
        dragRef.current = { x: 0, y: 0 };
        setDrag({ x: 0, y: 0 });
        onCenterChangeRef.current?.({
          lat: worldYToLat(cy, s),
          lon: worldXToLon(cx, s),
        });
      },
    }),
  ).current;

  // Held in a ref so the PanResponder, created once, never sees a stale callback.
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  }, []);

  const view = useMemo(() => {
    if (size.width === 0 || size.height === 0) return null;

    const centerX = lonToWorldX(center.lon, scale) - drag.x;
    const centerY = latToWorldY(center.lat, scale) - drag.y;
    const left = centerX - size.width / 2;
    const top = centerY - size.height / 2;

    const tileCount = Math.pow(2, level);
    const firstX = Math.floor(left / TILE);
    const firstY = Math.floor(top / TILE);
    const lastX = Math.floor((left + size.width) / TILE);
    const lastY = Math.floor((top + size.height) / TILE);

    const tiles: { key: string; uri: string; x: number; y: number }[] = [];
    for (let ty = firstY; ty <= lastY; ty++) {
      // Vertical wrap is meaningless; horizontal wraps around the globe.
      if (ty < 0 || ty >= tileCount) continue;
      for (let tx = firstX; tx <= lastX; tx++) {
        const wrapped = ((tx % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${level}/${tx}/${ty}`,
          uri: TILE_URL(level, wrapped, ty),
          x: tx * TILE - left,
          y: ty * TILE - top,
        });
      }
    }

    const placed = markers.map((m) => ({
      marker: m,
      x: lonToWorldX(m.lon, scale) - left,
      y: latToWorldY(m.lat, scale) - top,
    })).filter(
      // Cull off-screen markers; a live feed can carry thousands.
      (p) => p.x > -40 && p.x < size.width + 40 && p.y > -40 && p.y < size.height + 40,
    );

    /**
     * Each segment is a thin View centred on the segment midpoint and rotated
     * to its bearing. Cheaper than pulling in react-native-svg for what is only
     * ever a handful of straight hops between stops.
     */
    const segments: {
      key: string; x: number; y: number; length: number;
      angle: number; color: string; width: number;
    }[] = [];

    for (const line of polylines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        const ax = lonToWorldX(line.points[i].lon, scale) - left;
        const ay = latToWorldY(line.points[i].lat, scale) - top;
        const bx = lonToWorldX(line.points[i + 1].lon, scale) - left;
        const by = latToWorldY(line.points[i + 1].lat, scale) - top;

        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 1) continue;

        const thickness = line.width ?? 3;
        segments.push({
          key: `${line.id}-${i}`,
          x: (ax + bx) / 2 - length / 2,
          y: (ay + by) / 2 - thickness / 2,
          length,
          angle: (Math.atan2(dy, dx) * 180) / Math.PI,
          color: line.color ?? colors.amber,
          width: thickness,
        });
      }
    }

    return { tiles, placed, segments };
  }, [size, center.lat, center.lon, scale, level, drag.x, drag.y, markers, polylines]);

  const zoomBy = (delta: number) =>
    setLevel((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));

  return (
    <View style={[s.root, style]} onLayout={onLayout} {...pan.panHandlers}>
      {view?.tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: t.uri }}
          style={[s.tile, { left: t.x, top: t.y }]}
          fadeDuration={0}
        />
      ))}

      {/* Knocks the light basemap back so overlays stay legible. */}
      <View pointerEvents="none" style={s.scrim} />

      {view?.segments.map((seg) => (
        <View
          key={seg.key}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: seg.x,
            top: seg.y,
            width: seg.length,
            height: seg.width,
            borderRadius: seg.width / 2,
            backgroundColor: seg.color,
            opacity: 0.85,
            transform: [{ rotate: `${seg.angle}deg` }],
          }}
        />
      ))}

      {view?.placed.map(({ marker, x, y }) => (
        <Pressable
          key={marker.id}
          onPress={marker.onPress}
          style={[s.marker, { left: x - 14, top: y - 14 }]}
          hitSlop={6}
        >
          <View
            style={[
              s.markerDot,
              { backgroundColor: marker.color ?? colors.amber },
              marker.bearing !== undefined && { transform: [{ rotate: `${marker.bearing}deg` }] },
            ]}
          >
            {marker.icon ? (
              <Feather name={marker.icon} size={13} color={colors.ink} />
            ) : marker.bearing !== undefined ? (
              <Feather name="navigation" size={13} color={colors.ink} />
            ) : null}
          </View>
          {!!marker.label && (
            <View style={s.markerLabel}>
              <Text style={[type.meta, { color: colors.text }]} numberOfLines={1}>
                {marker.label}
              </Text>
            </View>
          )}
        </Pressable>
      ))}

      <View style={s.zoomStack}>
        <Pressable style={s.zoomBtn} onPress={() => zoomBy(1)} hitSlop={4}>
          <Feather name="plus" size={16} color={colors.text} />
        </Pressable>
        <View style={s.zoomDivider} />
        <Pressable style={s.zoomBtn} onPress={() => zoomBy(-1)} hitSlop={4}>
          <Feather name="minus" size={16} color={colors.text} />
        </Pressable>
      </View>

      {/* Required by the ODbL licence — do not remove. */}
      {showAttribution && (
        <View style={s.attribution}>
          <Text style={s.attributionText}>© OpenStreetMap contributors</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    overflow: 'hidden',
    backgroundColor: colors.ink,
    position: 'relative',
  },
  tile: { position: 'absolute', width: TILE, height: TILE, opacity: TILE_OPACITY },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,14,19,0.30)' },

  marker: { position: 'absolute', alignItems: 'center' },
  markerDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.ink,
  },
  markerLabel: {
    marginTop: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: colors.ink,
    borderRadius: radius.sm,
    borderWidth: hairline, borderColor: colors.line,
    maxWidth: 140,
  },

  zoomStack: {
    position: 'absolute', right: space.md, top: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: hairline, borderColor: colors.line,
    overflow: 'hidden',
  },
  zoomBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  zoomDivider: { height: hairline, backgroundColor: colors.line },

  attribution: {
    position: 'absolute', left: 0, bottom: 0,
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(11,14,19,0.72)',
    borderTopRightRadius: radius.sm,
  },
  attributionText: { fontSize: 9, color: colors.textTertiary },
});
