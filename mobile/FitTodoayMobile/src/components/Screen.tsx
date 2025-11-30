import React, { PropsWithChildren, useMemo } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { useThemedColors } from '../theme/colors';
import { AppHeader } from './AppHeader';

export function Screen({ children }: PropsWithChildren) {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.background === '#f5f7fb' ? 'dark-content' : 'light-content'} />
      <AppHeader />
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.background,
      fontFamily: 'Inter-Regular',
    },
  });
