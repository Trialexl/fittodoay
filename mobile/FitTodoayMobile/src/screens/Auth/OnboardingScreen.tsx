import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { AuthStackParamList } from '../../navigation/types';
import { register, RegisterRequest } from '../../api/auth';
import { useAuthStore } from '../../state/auth';
import { notifyError } from '../../utils/notify';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

export function OnboardingScreen({ navigation }: Props) {
  const setSession = useAuthStore(state => state.setSession);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterRequest>({
    defaultValues: { email: '', password: '', name: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: RegisterRequest) => register(data),
    onSuccess: ({ token, user }) => {
      setSession(token, user);
    },
    onError: (err: any) => {
      notifyError(err?.message || 'Не удалось создать аккаунт');
    },
  });

  const onSubmit = (data: RegisterRequest) => {
    mutation.mutate(data);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Онбординг</Text>
        <Text style={styles.subtitle}>
          Сначала создадим аккаунт. Далее добавим профиль и предпочтения ассистента.
        </Text>
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Имя (опционально)"
              placeholder="Иван"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />

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

        {mutation.isError ? (
          <Text style={styles.errorText}>
            {(mutation.error as Error).message || 'Не удалось создать аккаунт'}
          </Text>
        ) : null}

        <PrimaryButton
          title="Создать аккаунт"
          onPress={handleSubmit(onSubmit)}
          loading={mutation.isLoading}
        />
        <PrimaryButton
          title="У меня уже есть аккаунт"
          onPress={() => navigation.navigate('Login')}
          disabled={mutation.isLoading}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f5f7fb',
  },
  subtitle: {
    fontSize: 15,
    color: '#c3cad5',
  },
  form: {
    gap: 12,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
  },
});
