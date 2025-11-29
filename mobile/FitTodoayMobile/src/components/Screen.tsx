import React, { PropsWithChildren } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
