import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, FlatList,
  ActivityIndicator, ScrollView, Animated, Platform, ViewStyle, TextStyle,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, type, space, radius, hairline, shadow, CONTENT_MAX_WIDTH } from './theme';

type Icon = keyof typeof Feather.glyphMap;

// ─── layout ───────────────────────────────────────────────────────────────────

/** Centers content in a readable column on wide (desktop web) viewports. */
export function Shell({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { width } = useWindowDimensions();
  const wide = width > CONTENT_MAX_WIDTH + 80;

  return (
    <View style={[st.shellOuter, style]}>
      <View style={[st.shellInner, wide && st.shellFramed]}>{children}</View>
    </View>
  );
}

export function Screen({
  children, scroll = false, contentStyle, overlay,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  /** Sheets and other layers — rendered above content, outside any scroll view. */
  overlay?: React.ReactNode;
}) {
  const body = scroll ? (
    <ScrollView
      style={st.flex}
      contentContainerStyle={[{ paddingBottom: space.huge }, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[st.flex, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <Shell>{body}</Shell>
      {overlay}
    </SafeAreaView>
  );
}

export function Header({
  title, subtitle, right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={st.header}>
      <View style={st.flex}>
        <Text style={[type.h1, { color: colors.text }]}>{title}</Text>
        {!!subtitle && (
          <Text style={[type.meta, { color: colors.textSecondary, marginTop: 3 }]}>{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ children, style }: { children: string; style?: TextStyle }) {
  return (
    <Text style={[type.overline, { color: colors.textTertiary }, st.sectionLabel, style]}>
      {children.toUpperCase()}
    </Text>
  );
}

export function Card({
  children, style, padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  return (
    <View style={[st.card, padded && { padding: space.lg }, style]}>{children}</View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[st.divider, style]} />;
}

// ─── buttons ──────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label, onPress, variant = 'primary', icon, loading, disabled, style, compact,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: Icon;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const off = disabled || loading;
  // A dimmed amber reads as murky olive on dark, so disabled primaries go neutral.
  const inert = disabled && variant === 'primary';
  const fg =
    inert                 ? colors.textTertiary :
    variant === 'primary' ? colors.textInverse :
    variant === 'danger'  ? colors.danger :
    variant === 'ghost'   ? colors.textSecondary :
    colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        st.btn,
        compact && { height: 40, paddingHorizontal: space.lg },
        variant === 'primary'   && st.btnPrimary,
        variant === 'secondary' && st.btnSecondary,
        variant === 'ghost'     && st.btnGhost,
        variant === 'danger'    && st.btnDanger,
        inert && st.btnInert,
        pressed && !off && { opacity: 0.82, transform: [{ scale: 0.985 }] },
        off && !inert && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {!!icon && <Feather name={icon} size={16} color={fg} style={{ marginRight: 7 }} />}
          <Text style={[type.label, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon, onPress, size = 42, tone = 'surface', disabled, style,
}: {
  icon: Icon;
  onPress: () => void;
  size?: number;
  tone?: 'surface' | 'amber' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg =
    tone === 'amber'  ? colors.amberSoft :
    tone === 'danger' ? colors.dangerSoft : colors.surfaceHi;
  const fg =
    tone === 'amber'  ? colors.amber :
    tone === 'danger' ? colors.danger : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        st.center,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Feather name={icon} size={size * 0.42} color={fg} />
    </Pressable>
  );
}

export function Chip({
  label, selected, onPress, icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: Icon;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.chip,
        selected && st.chipSelected,
        pressed && { opacity: 0.75 },
      ]}
    >
      {!!icon && (
        <Feather
          name={icon}
          size={13}
          color={selected ? colors.amber : colors.textTertiary}
          style={{ marginRight: 6 }}
        />
      )}
      <Text
        style={[
          type.meta,
          { color: selected ? colors.amber : colors.textSecondary },
          selected && { fontWeight: '600' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── settings controls ────────────────────────────────────────────────────────

export function Switch({
  value, onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[st.switchTrack, value && st.switchTrackOn]}
    >
      <View style={[st.switchKnob, value && st.switchKnobOn]} />
    </Pressable>
  );
}

/** A labelled row with an arbitrary control on the right. */
export function SettingRow({
  label, hint, right, onPress, last,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View style={[st.settingRow, !last && st.settingRowBorder]}>
      <View style={st.flex}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        {!!hint && (
          <Text style={[type.meta, { color: colors.textTertiary, marginTop: 3 }]}>{hint}</Text>
        )}
      </View>
      {!!right && <View style={{ marginLeft: space.lg }}>{right}</View>}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
  );
}

/** Horizontal exclusive choice. Wraps, so it copes with long option lists. */
export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={st.segWrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              st.segItem,
              active && st.segItemActive,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text
              style={[
                type.meta,
                { color: active ? colors.amber : colors.textSecondary },
                active && { fontWeight: '600' },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Numeric stepper — avoids pulling in a slider dependency. */
export function Stepper({
  value, min, max, step, format, onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const round = (n: number) => Math.round(n / step) * step;
  return (
    <View style={st.stepper}>
      <IconButton icon="minus" size={32} onPress={() => onChange(clamp(round(value - step)))} />
      <Text style={[type.label, st.stepperValue]}>
        {format ? format(value) : String(value)}
      </Text>
      <IconButton icon="plus" size={32} onPress={() => onChange(clamp(round(value + step)))} />
    </View>
  );
}

// ─── inputs ───────────────────────────────────────────────────────────────────

export function Field({
  value, onChangeText, placeholder, multiline, secure, onSubmit,
  autoCapitalize = 'sentences', icon, right, style,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secure?: boolean;
  onSubmit?: () => void;
  autoCapitalize?: 'none' | 'sentences' | 'characters';
  icon?: Icon;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        st.field,
        multiline && { minHeight: 104, alignItems: 'flex-start', paddingVertical: space.md },
        focused && st.fieldFocused,
        style,
      ]}
    >
      {!!icon && (
        <Feather
          name={icon}
          size={16}
          color={focused ? colors.amber : colors.textTertiary}
          style={{ marginRight: space.md, marginTop: multiline ? 3 : 0 }}
        />
      )}
      <TextInput
        style={[type.body, st.fieldInput, multiline && { minHeight: 76 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        multiline={multiline}
        secureTextEntry={secure}
        onSubmitEditing={onSubmit}
        returnKeyType={onSubmit ? 'search' : 'default'}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        textAlignVertical={multiline ? 'top' : 'center'}
        selectionColor={colors.amber}
      />
      {right}
    </View>
  );
}

// ─── feedback ─────────────────────────────────────────────────────────────────

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: any; style?: ViewStyle }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.4,  duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.surfaceHi, opacity: pulse }, style]}
    />
  );
}

export function EmptyState({
  icon, title, body, action,
}: {
  icon: Icon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={st.empty}>
      <View style={st.emptyIcon}>
        <Feather name={icon} size={22} color={colors.textTertiary} />
      </View>
      <Text style={[type.h3, { color: colors.text, marginTop: space.lg, textAlign: 'center' }]}>{title}</Text>
      {!!body && (
        <Text style={[type.body, st.emptyBody]}>{body}</Text>
      )}
      {!!action && <View style={{ marginTop: space.xl }}>{action}</View>}
    </View>
  );
}

export function Banner({
  tone, text, icon,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info';
  text: string;
  icon?: Icon;
}) {
  const map = {
    success: { bg: colors.successSoft, fg: colors.success, ic: 'check-circle' },
    warning: { bg: colors.warningSoft, fg: colors.warning, ic: 'alert-triangle' },
    danger:  { bg: colors.dangerSoft,  fg: colors.danger,  ic: 'alert-circle' },
    info:    { bg: colors.tealSoft,    fg: colors.teal,    ic: 'info' },
  } as const;
  const m = map[tone];
  return (
    <View style={[st.banner, { backgroundColor: m.bg }]}>
      <Feather name={(icon ?? m.ic) as Icon} size={15} color={m.fg} />
      <Text style={[type.meta, { color: m.fg, marginLeft: space.md, flex: 1 }]}>{text}</Text>
    </View>
  );
}

// ─── toast (replaces blocking Alert.alert) ────────────────────────────────────

type ToastTone = 'success' | 'error' | 'info';
type ToastCtx = (text: string, tone?: ToastTone) => void;

const ToastContext = createContext<ToastCtx>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ text: string; tone: ToastTone } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback<ToastCtx>((text, tone = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ text, tone });
    Animated.spring(anim, { toValue: 1, useNativeDriver: Platform.OS !== 'web', friction: 9 }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' })
        .start(() => setToast(null));
    }, 3400);
  }, [anim]);

  const map = {
    success: { fg: colors.success, ic: 'check-circle' },
    error:   { fg: colors.danger,  ic: 'alert-circle' },
    info:    { fg: colors.teal,    ic: 'info' },
  } as const;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {!!toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            st.toastWrap,
            { bottom: insets.bottom + 92 },
            {
              opacity: anim,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            },
          ]}
        >
          <View style={st.toast}>
            <Feather name={map[toast.tone].ic as Icon} size={16} color={map[toast.tone].fg} />
            <Text style={[type.meta, { color: colors.text, marginLeft: space.md, flex: 1 }]}>
              {toast.text}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// ─── bottom sheet ─────────────────────────────────────────────────────────────

export function Sheet({
  visible, onClose, title, children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!visible) return null;

  // Deliberately not RN's Modal: on web it portals into a zero-height div and
  // its slide animation leaves the panel stranded a full viewport below.
  return (
    <View style={st.sheetScrim}>
      <Pressable style={st.flex} onPress={onClose} />
      <View style={st.sheet}>
        <View style={st.sheetGrip} />
        <View style={st.sheetHeader}>
          <Text style={[type.h2, { color: colors.text }]}>{title}</Text>
          <IconButton icon="x" onPress={onClose} size={34} />
        </View>
        {children}
      </View>
    </View>
  );
}

/** Searchable language picker — 23 languages is too many for a plain list. */
export function LanguageSheet({
  visible, selected, onSelect, onClose, title = 'Select language', languages,
}: {
  visible: boolean;
  selected: string;
  onSelect: (name: string) => void;
  onClose: () => void;
  title?: string;
  languages: { name: string; native: string }[];
}) {
  const [q, setQ] = useState('');
  const filtered = q.trim()
    ? languages.filter(
        (l) =>
          l.name.toLowerCase().includes(q.trim().toLowerCase()) ||
          l.native.includes(q.trim()),
      )
    : languages;

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingHorizontal: space.xl, paddingBottom: space.md }}>
        <Field
          value={q}
          onChangeText={setQ}
          placeholder="Search languages"
          icon="search"
          autoCapitalize="none"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.name}
        style={{ maxHeight: 360 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const active = item.name === selected;
          return (
            <Pressable
              onPress={() => { setQ(''); onSelect(item.name); }}
              style={({ pressed }) => [st.langRow, pressed && { backgroundColor: colors.surfaceHi }]}
            >
              <View style={st.flex}>
                <Text style={[type.label, { color: active ? colors.amber : colors.text }]}>
                  {item.name}
                </Text>
                <Text style={[type.meta, { color: colors.textTertiary, marginTop: 2 }]}>
                  {item.native}
                </Text>
              </View>
              {active && <Feather name="check" size={17} color={colors.amber} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[type.meta, { color: colors.textTertiary, textAlign: 'center', padding: space.xl }]}>
            No language matches “{q}”
          </Text>
        }
      />
      <View style={{ height: space.xl }} />
    </Sheet>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  flex:   { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: colors.background },

  shellOuter: { flex: 1, alignItems: 'center' },
  shellInner: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH },
  shellFramed: {
    borderLeftWidth: hairline, borderRightWidth: hairline,
    borderColor: colors.lineSoft,
  },

  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.lg,
  },
  sectionLabel: { paddingHorizontal: space.xl, marginBottom: space.md, marginTop: space.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: hairline,
    borderColor: colors.line,
    marginHorizontal: space.xl,
    marginBottom: space.lg,
    ...shadow(1),
  },
  divider: { height: hairline, backgroundColor: colors.line, marginVertical: space.lg },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 50, borderRadius: radius.full, paddingHorizontal: space.xl,
  },
  btnPrimary:   { backgroundColor: colors.amber },
  btnInert:     { backgroundColor: colors.surfaceHi, borderWidth: hairline, borderColor: colors.line },
  btnSecondary: { backgroundColor: colors.surfaceHi, borderWidth: hairline, borderColor: colors.line },
  btnGhost:     { backgroundColor: 'transparent' },
  btnDanger:    { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.dangerSoft },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: space.md,
  },
  settingRowBorder: { borderBottomWidth: hairline, borderBottomColor: colors.lineSoft },

  switchTrack: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceHi,
    borderWidth: hairline, borderColor: colors.line,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  switchTrackOn: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },
  switchKnob:    { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textTertiary },
  switchKnobOn:  { backgroundColor: colors.amber, alignSelf: 'flex-end' },

  segWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'flex-end' },
  segItem: {
    paddingHorizontal: space.md, paddingVertical: 7,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.full,
    borderWidth: hairline, borderColor: colors.line,
  },
  segItemActive: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },

  stepper:      { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperValue: { color: colors.text, minWidth: 58, textAlign: 'center' },

  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: 9,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.full,
    borderWidth: hairline, borderColor: colors.line,
  },
  chipSelected: { backgroundColor: colors.amberSoft, borderColor: colors.amberLine },

  field: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: space.lg,
    minHeight: 50,
  },
  fieldFocused: { borderColor: colors.amberLine, backgroundColor: colors.surface },
  fieldInput: {
    flex: 1, color: colors.text,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null),
  },

  empty: { alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: space.huge },
  emptyIcon: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: hairline, borderColor: colors.line,
  },
  emptyBody: {
    color: colors.textSecondary, textAlign: 'center', marginTop: space.sm, maxWidth: 300,
  },

  banner: {
    flexDirection: 'row', alignItems: 'center',
    padding: space.lg, borderRadius: radius.lg,
    marginHorizontal: space.xl, marginBottom: space.lg,
  },

  toastWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.xl },
  toast: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.full,
    borderWidth: hairline, borderColor: colors.line,
    paddingVertical: space.md, paddingHorizontal: space.lg,
    maxWidth: CONTENT_MAX_WIDTH - space.xl * 2,
    ...shadow(3),
  },

  sheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    borderTopWidth: hairline, borderColor: colors.line,
    width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center',
    paddingTop: space.md,
    ...shadow(3),
  },
  sheetGrip: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.line, alignSelf: 'center', marginBottom: space.sm,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.xl, paddingVertical: space.lg,
  },
  langRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.xl, paddingVertical: space.md,
  },
});
