import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, type, radius, space } from './theme';

/**
 * Native placeholder. The `qrcode` package rasterises through a canvas and its
 * Node entry pulls in `fs`, so it cannot be bundled for iOS/Android — Metro
 * loads QrCode.web.tsx for web instead.
 *
 * A native build should swap this for react-native-qrcode-svg. Until then this
 * says so plainly rather than rendering a blank square that reads as a broken
 * ticket.
 */
export function QrCode({
  size = 200, label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  return (
    <View style={s.wrap}>
      <View style={[s.frame, { width: size, height: size }]}>
        <Text style={[type.meta, s.note]}>
          QR rendering needs react-native-qrcode-svg on this platform
        </Text>
      </View>
      {!!label && (
        <Text style={[type.meta, { color: colors.textTertiary, marginTop: space.md }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center' },
  frame: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { color: '#8A8A8A', textAlign: 'center' },
});
