import { Platform, StyleSheet } from 'react-native';

/**
 * Dark "transit signage" palette — ink base with an amber primary, echoing
 * the illuminated destination boards on Indian city buses.
 */
export const colors = {
  // base
  ink:            '#0B0E13',
  background:     '#0E1218',
  surface:        '#161B23',
  surfaceHi:      '#1E242E',
  surfacePressed: '#252C38',

  // lines
  line:           '#252C38',
  lineSoft:       '#1B212A',

  // text
  text:           '#F4F6F8',
  textSecondary:  '#98A2B0',
  textTertiary:   '#5F6B7A',
  textInverse:    '#0B0E13',

  // primary — bus board amber
  amber:          '#FFB224',
  amberHi:        '#FFC24D',
  amberSoft:      'rgba(255,178,36,0.14)',
  amberLine:      'rgba(255,178,36,0.30)',

  // secondary — route line teal
  teal:           '#2DD4BF',
  tealSoft:       'rgba(45,212,191,0.13)',

  // semantic
  success:        '#34D399',
  successSoft:    'rgba(52,211,153,0.13)',
  warning:        '#FBBF24',
  warningSoft:    'rgba(251,191,36,0.13)',
  danger:         '#F87171',
  dangerSoft:     'rgba(248,113,113,0.13)',

  white:          '#FFFFFF',
  black:          '#000000',
  scrim:          'rgba(6,8,12,0.72)',
} as const;

/** Inter on web (injected in App.tsx); platform system font elsewhere. */
export const fontFamily = Platform.select({
  web: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  ios: 'System',
  default: 'Roboto',
});

const f = { fontFamily } as const;

export const type = {
  display:  { ...f, fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.8, lineHeight: 38 },
  h1:       { ...f, fontSize: 25, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 31 },
  h2:       { ...f, fontSize: 19, fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: 25 },
  h3:       { ...f, fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 22 },
  bodyLg:   { ...f, fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.1, lineHeight: 26 },
  body:     { ...f, fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.1, lineHeight: 22 },
  label:    { ...f, fontSize: 14, fontWeight: '600' as const, letterSpacing: -0.1, lineHeight: 18 },
  meta:     { ...f, fontSize: 12.5, fontWeight: '500' as const, letterSpacing: 0, lineHeight: 17 },
  overline: { ...f, fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 1.0, lineHeight: 14 },
  numeric:  { ...f, fontSize: 20, fontWeight: '800' as const, letterSpacing: -0.4, lineHeight: 24 },
} as const;

export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48,
} as const;

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 9999,
} as const;

export const hairline = StyleSheet.hairlineWidth;

/** Cross-platform elevation. RN Web translates shadow* into box-shadow. */
export function shadow(level: 1 | 2 | 3) {
  const map = {
    1: { radius: 8,  y: 2, opacity: 0.28, elevation: 3 },
    2: { radius: 18, y: 6, opacity: 0.36, elevation: 8 },
    3: { radius: 34, y: 14, opacity: 0.46, elevation: 16 },
  } as const;
  const m = map[level];
  return {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: m.y },
    shadowOpacity: m.opacity,
    shadowRadius:  m.radius,
    elevation:     m.elevation,
  };
}

/** Max content width — keeps the app a readable column on desktop web. */
export const CONTENT_MAX_WIDTH = 480;
