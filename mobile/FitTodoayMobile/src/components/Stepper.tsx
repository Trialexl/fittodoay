import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
}

export function Stepper({ label, value, onChange, step = 1, min = 0 }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(value + step);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <Pressable style={styles.button} onPress={dec}>
          <Text style={styles.buttonText}>-</Text>
        </Pressable>
        <Text style={styles.value}>{value}</Text>
        <Pressable style={styles.button} onPress={inc}>
          <Text style={styles.buttonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    color: colors.muted,
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  value: {
    minWidth: 40,
    textAlign: 'center',
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
