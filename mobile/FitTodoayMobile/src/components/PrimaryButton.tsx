import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { colors } from '../theme/colors';

interface PrimaryButtonProps {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'ghost';
  accessibilityLabel?: string;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  accessibilityLabel,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' && styles.buttonGhost,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}>
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.text : colors.primaryText} />
      ) : (
        <Text style={[styles.title, variant === 'ghost' && styles.titleGhost]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.primaryText,
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  titleGhost: {
    color: colors.text,
  },
});
