import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View, Pressable } from 'react-native';
import { useThemedColors } from '../theme/colors';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  visible: boolean;
  exerciseName: string;
  duration: number;
  onCancel: () => void;
  onFinishEarly: (actualTime: number) => void;
};

export function ExecutionOverlay({ visible, exerciseName, duration, onCancel, onFinishEarly }: Props) {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    if (!visible) return;
    setRemaining(duration);
    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(id);
          onFinishEarly(duration);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [visible, duration, onFinishEarly]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable style={styles.close} onPress={onCancel}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
          <Text style={styles.label}>Выполнение</Text>
          <Text style={styles.title}>{exerciseName}</Text>
          <View style={styles.timerCircle}>
            <Text style={styles.timerText}>{remaining}s</Text>
          </View>
          <View style={styles.actions}>
            <PrimaryButton
              title="Выполнить досрочно"
              variant="ghost"
              onPress={() => onFinishEarly(duration - remaining)}
            />
            <PrimaryButton title="Прервать" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 16,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      gap: 12,
    },
    close: {
      position: 'absolute',
      top: 10,
      right: 12,
      padding: 6,
    },
    closeText: {
      fontSize: 20,
      color: colors.muted,
    },
    label: {
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontWeight: '700',
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
      textAlign: 'center',
    },
    timerCircle: {
      width: 160,
      height: 160,
      borderRadius: 80,
      borderWidth: 6,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    timerText: {
      color: colors.text,
      fontSize: 36,
      fontWeight: '800',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
  });
