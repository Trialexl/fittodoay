import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useOnline } from '../hooks/useOnline';
import { useThemedColors } from '../theme/colors';

export function OfflineBanner() {
  const online = useOnline();
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (online) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Нет соединения. Данные синхронизируем, когда вернётся интернет.</Text>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
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
