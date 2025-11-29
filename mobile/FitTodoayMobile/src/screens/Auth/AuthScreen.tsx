import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AuthStackParamList } from '../../navigation/types';
import { login, LoginRequest, register, RegisterRequest } from '../../api/auth';
import { useAuthStore } from '../../state/auth';
import { notifyError } from '../../utils/notify';
import { colors } from '../../theme/colors';
import { Pressable } from 'react-native';

type Props = NativeStackScreenProps<AuthStackParamList, 'AuthScreen'>;

export function AuthScreen(_: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const setSession = useAuthStore(state => state.setSession);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest & RegisterRequest>({
    defaultValues: { email: '', password: '', name: '' },
  });

  const loginMutation = useMutation({
    mutationFn: (data: LoginRequest) => login(data),
    onSuccess: ({ token, user }) => setSession(token, user),
    onError: (err: any) => notifyError(err?.message || 'Не удалось войти'),
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterRequest) => register(data),
    onSuccess: ({ token, user }) => setSession(token, user),
    onError: (err: any) => notifyError(err?.message || 'Не удалось создать аккаунт'),
  });

  const onSubmit = (values: LoginRequest & RegisterRequest) => {
    if (mode === 'login') {
      loginMutation.mutate({ email: values.email, password: values.password });
    } else {
      registerMutation.mutate({
        email: values.email,
        password: values.password,
        name: values.name,
      });
    }
  };

  const isLoading = loginMutation.isLoading || registerMutation.isLoading;

  return (
    <Screen>
      <View style={styles.overlay}>
        <Text style={styles.heroTitle}>Привет</Text>
        <Text style={styles.heroSubtitle}>
          Всё, что нужно для тренировки: чеклист дня, таймер отдыха и чистый интерфейс. Всё, что тебе так не хватало.
        </Text>

        <View style={styles.card}>
          <View style={styles.modeTabs}>
            <Pressable
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => setMode('login')}>
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Вход</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === 'register' && styles.tabActive]}
              onPress={() => setMode('register')}>
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                Регистрация
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            {mode === 'register' && (
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField
                    label="Имя (опционально)"
                    placeholder="Иван"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value || ''}
                  />
                )}
              />
            )}

            <Controller
              control={control}
              name="email"
              rules={{ required: 'Введите e-mail' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="E-mail"
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.email?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              rules={{ required: 'Введите пароль', minLength: { value: 6, message: 'Мин. 6 символов' } }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Пароль"
                  placeholder="••••••••"
                  secureTextEntry
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.password?.message}
                />
              )}
            />

            <PrimaryButton
              title={mode === 'login' ? 'Начать тренировку' : 'Создать аккаунт'}
              onPress={handleSubmit(onSubmit)}
              loading={isLoading}
            />
            <Text style={styles.helper}>Введите email и пароль</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    padding: 20,
    gap: 20,
    backgroundColor: '#0c0f1a',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    fontFamily: 'Inter-Bold',
  },
  heroSubtitle: {
    color: colors.muted,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  modeTabs: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary + '33',
  },
  tabText: {
    color: colors.muted,
    fontWeight: '700',
    fontFamily: 'Inter-SemiBold',
  },
  tabTextActive: {
    color: colors.primary,
  },
  form: {
    gap: 12,
  },
  helper: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
});
