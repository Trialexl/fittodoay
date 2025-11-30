import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { BrandMark } from '../../components/BrandMark';
import { AuthStackParamList } from '../../navigation/types';
import { login, register, LoginRequest, RegisterRequest } from '../../api/auth';
import { useAuthStore } from '../../state/auth';
import { notifyError } from '../../utils/notify';
import { buildDefaultProfile } from '../../utils/profileDefaults';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

export function LandingScreen({ navigation }: Props) {
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const setSession = useAuthStore(state => state.setSession);
  const [statusText, setStatusText] = useState('Введите email и пароль');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<LoginRequest & RegisterRequest>({
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    // В тестах отключаем анимацию
    if (typeof jest !== 'undefined') {
      heroOpacity.setValue(1);
      cardOpacity.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 500,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroOpacity, cardOpacity]);

  const onSubmit = async () => {
    const { email, password, name } = getValues();
    if (!email || !password) return;
    setSubmitting(true);
    setErrorText(null);
    setStatusText('Входим...');
    try {
      const loginRes = await login({ email, password });
      setSession(loginRes.token, loginRes.user);
      return;
    } catch (err: any) {
      if (err?.status === 400 || err?.status === 404) {
        try {
          setStatusText('Создаём аккаунт...');
          const registerRes = await register({
            email,
            password,
            name,
            profile: buildDefaultProfile(),
          });
          setSession(registerRes.token, registerRes.user);
          return;
        } catch (regErr: any) {
          const msg = regErr?.message || 'Не удалось создать аккаунт';
          setErrorText(msg);
          setStatusText('Введите email и пароль');
          notifyError(msg);
        } finally {
          setSubmitting(false);
        }
        return;
      }
      const msg = err?.message || 'Не удалось войти';
      setErrorText(msg);
      setStatusText('Введите email и пароль');
      notifyError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <StatusBar barStyle="light-content" />
      <View style={styles.full}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.hero, { opacity: heroOpacity }]}>
            <Text style={styles.script}>Привет</Text>
            <Text style={styles.subtitle}>
              Всё, что нужно для тренировки: чеклист дня, таймер отдыха и чистый интерфейс.
              Всё, что тебе так не хватало.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.card, { opacity: cardOpacity }]}>
            <BrandMark />
            <View style={styles.inputs}>
              <Text style={styles.label}>Email</Text>
              <Controller
                control={control}
                name="email"
                rules={{ required: 'Введите e-mail' }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="#7b8199"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              {errors.email?.message ? (
                <Text style={styles.errorText}>{errors.email.message}</Text>
              ) : null}
              <Text style={styles.label}>Пароль</Text>
              <Controller
                control={control}
                name="password"
                rules={{ required: 'Введите пароль' }}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#7b8199"
                    secureTextEntry
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                  />
                )}
          />
              {errors.password?.message ? (
                <Text style={styles.errorText}>{errors.password.message}</Text>
              ) : null}
              <PrimaryButton
                title="Начать тренировку"
                onPress={handleSubmit(onSubmit)}
                loading={submitting}
              />
              <PrimaryButton
                title="Заполнить профиль"
                variant="ghost"
                onPress={() =>
                  navigation.navigate('Onboarding', {
                    email: getValues('email'),
                    password: getValues('password'),
                    name: getValues('name' as keyof (LoginRequest & RegisterRequest)) as string | undefined,
                  })
                }
              />
              <Text style={styles.helper}>{statusText}</Text>
              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    backgroundColor: '#0c0f1a',
  },
  container: {
    flex: 1,
    paddingBottom: 32,
    gap: 24,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  hero: {
    alignItems: 'center',
    gap: 20,
    marginTop: 60,
    paddingHorizontal: 12,
  },
  script: {
    fontSize: 64,
    fontWeight: '400',
    color: '#b46bff',
    letterSpacing: 1,
    fontFamily: 'Christopher',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#eef1ff',
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: 16,
    color: '#9aa3c7',
    textAlign: 'center',
    paddingHorizontal: 12,
    fontFamily: 'Inter-Regular',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1d2238',
    backgroundColor: '#0e1222',
    padding: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
    width: '100%',
    maxWidth: 420,
  },
  brandTop: {
    textAlign: 'center',
    color: '#9aa3c7',
    letterSpacing: 6,
    fontSize: 12,
    marginTop: 6,
    fontFamily: 'Inter-Regular',
  },
  brandMid: {
    textAlign: 'center',
    color: '#b46bff',
    fontSize: 14,
    letterSpacing: 3,
    marginBottom: 12,
    fontFamily: 'Inter-SemiBold',
  },
  inputs: {
    gap: 10,
  },
  label: {
    color: '#cfd4e8',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  input: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#2b3043',
    paddingHorizontal: 12,
    color: '#d8dbea',
    fontFamily: 'Inter-Regular',
  },
  helper: {
    color: '#7680a0',
    textAlign: 'center',
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
});
