import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { AdjustNumber } from './AdjustNumber';

type RestTimerOverlayProps = {
  visible: boolean;
  duration: number;
  hasTime?: boolean;
  hasWeight?: boolean;
  onChange: (field: 'reps' | 'weight' | 'time', value: string) => void;
  values: { reps: string; weight: string; time: string };
  onSkip: () => void;
  onFinish: () => void;
};

export function RestTimerOverlay({
  visible,
  duration,
  hasTime,
  hasWeight,
  onChange,
  values,
  onSkip,
  onFinish,
}: RestTimerOverlayProps) {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = React.useCallback(() => {
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
  }, [onFinish]);

  useEffect(() => {
    if (!visible) return;
    setRemaining(duration);
    startTimer();
    return () => {
      intervalRef.current && clearInterval(intervalRef.current);
    };
  }, [visible, duration, onFinish, startTimer]);

  const progress = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Отдых</Text>
          <Text style={styles.timer}>{remaining}s</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.inputs}>
            {!hasTime ? (
              <>
                <AdjustNumber label="Повторы" value={values.reps} onChange={text => onChange('reps', text)} />
                {hasWeight !== false ? (
                  <AdjustNumber
                    label="Вес"
                    value={values.weight}
                    onChange={text => onChange('weight', text)}
                    inputMode="decimal"
                    step={2}
                  />
                ) : null}
              </>
            ) : (
              <AdjustNumber label="Время (сек)" value={values.time} onChange={text => onChange('time', text)} />
            )}
          </View>
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={() => {
              setRemaining(duration);
              startTimer();
            }}>
              <Text style={styles.secondaryText}>Рестарт</Text>
            </Pressable>
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
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
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
