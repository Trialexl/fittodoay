import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useOnline } from '../hooks/useOnline';
import { colors } from '../theme/colors';

export function OfflineBanner() {
  const online = useOnline();

  if (online) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Нет соединения. Данные синхронизируем, когда вернётся интернет.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.amber,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#0c0f1a',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
