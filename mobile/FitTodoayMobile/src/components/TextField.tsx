import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { useThemedColors } from '../theme/colors';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  accessibilityLabel?: string;
}

export function TextField({ label, error, style, accessibilityLabel, ...props }: TextFieldProps) {
  const hasError = Boolean(error);
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, hasError && styles.inputError, style]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityHint={props.placeholder}
        {...props}
      />
      {hasError ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    container: {
      width: '100%',
      gap: 6,
    },
    label: {
      color: colors.muted,
      fontSize: 14,
      fontWeight: '600',
      fontFamily: 'Inter-SemiBold',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      fontFamily: 'Inter-Regular',
    },
    inputError: {
      borderColor: colors.danger,
    },
    error: {
      color: colors.danger,
      fontSize: 13,
      fontFamily: 'Inter-Regular',
    },
  });
