import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeStore } from '../state/theme';
import { useThemedColors } from '../theme/colors';

const ACCENT_OPTIONS = [
  { value: '#b46bff', label: 'Фиолетовый' },
  { value: '#0ea5e9', label: 'Голубой' },
  { value: '#22c55e', label: 'Зелёный' },
  { value: '#f59e0b', label: 'Янтарный' },
  { value: '#ef4444', label: 'Красный' },
];

export function ThemeSelector() {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const theme = useThemeStore(state => state.theme);
  const accent = useThemeStore(state => state.accentColor);
  const setTheme = useThemeStore(state => state.setTheme);
  const setAccent = useThemeStore(state => state.setAccentColor);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Тема</Text>
      <View style={styles.row}>
        <Pressable
          style={[styles.chip, theme === 'light' && styles.chipActive]}
          onPress={() => setTheme('light')}
        >
          <Text style={[styles.chipText, theme === 'light' && styles.chipTextActive]}>Светлая</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, theme === 'dark' && styles.chipActive]}
          onPress={() => setTheme('dark')}
        >
          <Text style={[styles.chipText, theme === 'dark' && styles.chipTextActive]}>Тёмная</Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { marginTop: 12 }]}>Акцент</Text>
      <View style={styles.accents}>
        {ACCENT_OPTIONS.map(option => {
          const active = option.value.toLowerCase() === accent.toLowerCase();
          return (
            <Pressable
              key={option.value}
              style={[
                styles.accentDot,
                { backgroundColor: option.value, borderColor: active ? colors.text : colors.border },
              ]}
              onPress={() => setAccent(option.value)}
            >
              {active ? <Text style={styles.accentCheck}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    container: {
      gap: 8,
    },
    label: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: '700',
    },
    row: {
      flexDirection: 'row',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceMuted,
    },
    chipText: {
      color: colors.text,
      fontWeight: '700',
    },
    chipTextActive: {
      color: colors.primary,
    },
    accents: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    accentDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accentCheck: {
      color: '#fff',
      fontWeight: '800',
    },
  });
