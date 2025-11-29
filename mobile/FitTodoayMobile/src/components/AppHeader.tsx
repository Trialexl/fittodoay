import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MainTabParamList } from '../navigation/types';
import { BrandMark } from './BrandMark';
import { colors } from '../theme/colors';
import { useAuthStore } from '../state/auth';
import { notifyError } from '../utils/notify';
import { apiFetch } from '../api/client';

const LINKS: { key: keyof MainTabParamList; label: string }[] = [
  { key: 'Programs', label: 'Программы' },
  { key: 'Workout', label: 'Чеклист' },
  { key: 'Analytics', label: 'Аналитика' },
  { key: 'Assistant', label: 'Помощник' },
  { key: 'Profile', label: 'Профиль' },
];

export function AppHeader() {
  const navigation = useNavigation();
  const route = useRoute();
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);

  const currentRouteName = (route.name || '') as string;

  const navigate = (key: keyof MainTabParamList) => {
    // @ts-ignore navigation typing for tabs
    navigation.navigate(key as never);
  };

  const sendFeedback = async () => {
    setSendingFeedback(true);
    setFeedbackError(null);
    try {
      await apiFetch({
        method: 'POST',
        path: '/api/feedback/',
        token,
        body: { message: 'Мобильный: добавьте вашу форму фидбека' },
      });
    } catch (e: any) {
      const msg = e?.message || 'Не удалось отправить отзыв';
      setFeedbackError(msg);
      notifyError(msg);
    } finally {
      setSendingFeedback(false);
    }
  };

  return (
    <View style={styles.header}>
      <BrandMark />
      <View style={styles.nav}>
        {LINKS.map(link => {
          const active = currentRouteName === link.key;
          return (
            <Pressable
              key={link.key}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => navigate(link.key)}
              accessibilityRole="link"
              accessibilityLabel={`Перейти: ${link.label}`}
            >
              <Text style={[styles.navText, active && styles.navTextActive]}>{link.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.feedback} onPress={sendFeedback} disabled={sendingFeedback}>
          <Text style={styles.feedbackText}>{sendingFeedback ? '...' : 'Отзыв'}</Text>
        </Pressable>
        {feedbackError ? <Text style={styles.error}>{feedbackError}</Text> : null}
        {user?.email ? <Text style={styles.user}>{user.email}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  navItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  navItemActive: {
    backgroundColor: colors.primary,
  },
  navText: {
    color: colors.text,
    fontWeight: '700',
  },
  navTextActive: {
    color: colors.primaryText,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feedback: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feedbackText: {
    color: colors.text,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  user: {
    color: colors.muted,
    fontSize: 12,
  },
});
