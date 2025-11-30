import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BrandMark } from './BrandMark';
import { useThemedColors } from '../theme/colors';

export function AppHeader() {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.header}>
      <BrandMark />
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
  });
