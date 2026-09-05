import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
// Static import so Metro bundles it; the package's `browser` field points this
// at lib/browser.js, which rasterises through a canvas instead of Node's fs.
import QRCode from 'qrcode';

import { colors, type, radius, space } from './theme';

export function QrCode({
  value, size = 200, label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);

    QRCode.toDataURL(value, {
      width: size * 2,          // 2× for crisp rendering when scaled down
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B0E13', light: '#FFFFFF' },
    })
      .then((out) => { if (alive) setUri(out); })
      .catch((err) => {
        console.warn('QR generation failed:', err);
        if (alive) setFailed(true);
      });

    return () => { alive = false; };
  }, [value, size]);

  return (
    <View style={s.wrap}>
      <View style={[s.frame, { width: size, height: size }]}>
        {failed ? (
          <Text style={[type.meta, s.error]}>Could not render this code</Text>
        ) : (
          !!uri && <Image source={{ uri }} style={{ width: size, height: size }} />
        )}
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
    padding: space.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: '#8A8A8A', textAlign: 'center', paddingHorizontal: space.md },
});
