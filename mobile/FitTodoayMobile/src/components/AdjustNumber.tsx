import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  step?: number;
  holdStep?: number;
  inputMode?: 'numeric' | 'decimal';
  disabled?: boolean;
};

const HOLD_DELAY = 400;
const HOLD_INTERVAL = 120;

export function AdjustNumber({
  label,
  value,
  onChange,
  step = 1,
  holdStep,
  inputMode = 'numeric',
  disabled,
}: Props) {
  const holdRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    holdRef.current = null;
    intervalRef.current = null;
  };

  const applyDelta = (delta: number) => {
    const parsed = Number(value.replace(',', '.'));
    const base = Number.isNaN(parsed) ? 0 : parsed;
    const next = Math.max(0, base + delta);
    onChange(String(next));
  };

  const startHold = (delta: number) => {
    if (disabled) return;
    clearTimers();
    holdRef.current = setTimeout(() => {
      applyDelta((holdStep ?? step * 5) * delta);
      intervalRef.current = setInterval(() => {
        applyDelta((holdStep ?? step * 5) * delta);
      }, HOLD_INTERVAL);
    }, HOLD_DELAY);
  };

  const stopHold = () => {
    clearTimers();
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Pressable
          style={[styles.btn, disabled && styles.btnDisabled]}
          onPress={() => applyDelta(-step)}
          onPressIn={() => startHold(-1)}
          onPressOut={stopHold}
          disabled={disabled}
        >
          <Text style={styles.btnText}>-</Text>
        </Pressable>
        <TextInput
          style={[styles.input, disabled && styles.inputDisabled]}
          keyboardType={inputMode === 'decimal' ? 'decimal-pad' : 'number-pad'}
          value={value}
          onChangeText={onChange}
          editable={!disabled}
        />
        <Pressable
          style={[styles.btn, disabled && styles.btnDisabled]}
          onPress={() => applyDelta(step)}
          onPressIn={() => startHold(1)}
          onPressOut={stopHold}
          disabled={disabled}
        >
          <Text style={styles.btnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputDisabled: {
    opacity: 0.5,
  },
});
