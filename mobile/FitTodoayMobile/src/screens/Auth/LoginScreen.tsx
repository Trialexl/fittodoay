import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../state/auth';
import { login, LoginRequest } from '../../api/auth';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { notifyError } from '../../utils/notify';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    defaultValues: { email: '', password: '' },
  });
  const setSession = useAuthStore(state => state.setSession);

  const mutation = useMutation({
    mutationFn: (data: LoginRequest) => login(data),
    onSuccess: ({ token, user }) => {
      setSession(token, user);
    },
    onError: (err: any) => {
      notifyError(err?.message || 'Не удалось войти');
    },
  });

  const onSubmit = (data: LoginRequest) => {
    mutation.mutate(data);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Вход</Text>
        <Text style={styles.subtitle}>
          Используйте e-mail и пароль из регистрации, чтобы продолжить.
        </Text>
      </View>

      <View style={styles.form}>
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
          rules={{ required: 'Введите пароль' }}
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
            {(mutation.error as Error).message || 'Не удалось войти'}
          </Text>
        ) : null}

        <PrimaryButton
          title="Войти"
          onPress={handleSubmit(onSubmit)}
          loading={mutation.isLoading}
        />

        <PrimaryButton
          title="Онбординг / Регистрация"
          onPress={() => navigation.navigate('Onboarding')}
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
