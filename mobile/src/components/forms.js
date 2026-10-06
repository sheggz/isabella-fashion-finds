// Form building blocks for the owner screens, styled from the brand kit.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { formatWhen, fromLocalInputValue } from '@isabella/core';
import { dateToLocalInput, localInputToDate } from '../lib/datetime';
import { useSession } from '../useSession';
import { useTheme } from '../theme';
import { Centered } from './ui';

/** A labelled text box with an optional hint and an error message under it. */
export function Field({ label, value, onChangeText, error, hint, keyboardType, multiline = false, placeholder, maxLength }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{
          color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border, borderWidth: 1,
          borderRadius: radius, paddingHorizontal: 12, paddingVertical: 10, minHeight: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export function Toggle({ label, value, onValueChange }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} trackColor={{ true: colors.accent }} />
    </View>
  );
}

/** A row of mutually exclusive options. */
export function Choice({ options, value, onChange }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={{ borderWidth: 1.5, borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : 'transparent', borderRadius: radius, paddingVertical: 8, paddingHorizontal: 14 }}
          >
            <Text style={{ color: active ? colors.accentText : colors.text, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Section({ title, children }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 14, gap: 12 }}>
      {title ? <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{title}</Text> : null}
      {children}
    </View>
  );
}

/**
 * Date and time chosen with the phone's own pickers. `value` / `onChange` use the shared form's
 * "YYYY-MM-DDTHH:mm" text. On Android a picker can only do date OR time, so it asks for the date
 * first and then the time; iOS shows one combined picker.
 */
export function DateTimeField({ label, value, onChange, error }) {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(null); // null | 'date' | 'time' | 'datetime'
  const [draft, setDraft] = useState(null); // Android: the date chosen in the first step
  const current = localInputToDate(value) ?? new Date();
  const tz = new Date().getTimezoneOffset();
  const shown = formatWhen(fromLocalInputValue(value, tz) ?? '', tz) || 'Choose date and time';

  const handle = (event, picked) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed' || !picked) { setOpen(null); setDraft(null); return; }
      if (open === 'date') { setDraft(picked); setOpen('time'); return; }
      const merged = new Date(draft ?? current);
      merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      setOpen(null); setDraft(null);
      onChange(dateToLocalInput(merged));
      return;
    }
    if (picked) onChange(dateToLocalInput(picked));
  };

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        onPress={() => setOpen(Platform.OS === 'android' ? 'date' : open ? null : 'datetime')}
        style={{ borderColor: error ? colors.danger : colors.border, borderWidth: 1, borderRadius: radius, backgroundColor: colors.surface, padding: 12 }}
      >
        <Text style={{ color: colors.text }}>{shown}</Text>
      </Pressable>
      {open ? <DateTimePicker value={draft ?? current} mode={open} display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={handle} /> : null}
      {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

/**
 * Role guard for owner screens. The server enforces the owner role on every request; this only
 * keeps the screens (and their errors) away from people who cannot use them.
 */
export function OwnerOnly({ children }) {
  const { colors } = useTheme();
  const { status, user } = useSession();
  if (status === 'loading') return <Centered><Text style={{ color: colors.muted }}>Checking your sign-in…</Text></Centered>;
  if (status !== 'signedIn' || user?.role !== 'owner') {
    return (
      <Centered>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Store owner only</Text>
        <Text style={{ color: colors.muted }}>This area is for the store owner. Sign in with the owner account to continue.</Text>
      </Centered>
    );
  }
  return children;
}
