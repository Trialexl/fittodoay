import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface RestTimerOverlayProps {
  visible: boolean;
  duration: number;
  onSkip: () => void;
  onFinish: () => void;
}

export function RestTimerOverlay({ visible, duration, onSkip, onFinish }: RestTimerOverlayProps) {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!visible) return;
    setRemaining(duration);
    intervalRef.current && clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          onFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      intervalRef.current && clearInterval(intervalRef.current);
    };
  }, [visible, duration, onFinish]);

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Отдых</Text>
          <Text style={styles.timer}>{remaining}s</Text>
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={onSkip}>
              <Text style={styles.secondaryText}>Пропустить</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={onFinish}>
              <Text style={styles.primaryText}>Готово</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Inter-Bold',
  },
  timer: {
    color: colors.primary,
    fontSize: 42,
    fontWeight: '800',
    fontFamily: 'Inter-Bold',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.muted,
    fontFamily: 'Inter-SemiBold',
  },
  primary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.primaryText,
    fontFamily: 'Inter-Bold',
  },
});
