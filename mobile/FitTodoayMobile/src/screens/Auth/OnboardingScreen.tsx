import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Stepper } from '../../components/Stepper';
import { colors } from '../../theme/colors';
import { register } from '../../api/auth';
import { useAuthStore } from '../../state/auth';
import { notifyError } from '../../utils/notify';
import { buildDefaultProfile } from '../../utils/profileDefaults';
import { useThemedColors } from '../../theme/colors';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

type ProfileFields = ReturnType<typeof buildDefaultProfile>;

type WizardState = {
  email: string;
  password: string;
  name: string;
  profile: ProfileFields;
};

const steps = [
  {
    title: 'Аккаунт',
    description: 'Введите контакты для входа',
    fields: ['email', 'password', 'name'] as const,
  },
  {
    title: 'Цели и уровень',
    description: 'Расскажите о цели и текущем уровне',
    fields: ['goal', 'level'] as const,
  },
  {
    title: 'Биометрия',
    description: 'Заполните возраст, рост и вес',
    fields: ['age', 'height_cm', 'weight_kg'] as const,
  },
  {
    title: 'Оборудование и ограничения',
    description: 'Оборудование, ограничения и график',
    fields: ['equipment', 'health_limitations', 'preferred_schedule_notes'] as const,
  },
];

export function OnboardingScreen({ route }: Props) {
  const themeColors = useThemedColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const { email = '', password = '', name = '' } = route.params || {};
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WizardState>({
    email,
    password,
    name,
    profile: buildDefaultProfile(),
  });
  const setSession = useAuthStore(s => s.setSession);

  const currentStep = useMemo(() => steps[step], [step]);

  const updateField = (field: keyof WizardState, value: string) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  const updateProfileField = (field: keyof ProfileFields, value: string | number) =>
    setState(prev => ({
      ...prev,
      profile: {
        ...prev.profile,
        [field]: value,
      },
    }));

  const validateStep = () => {
    if (currentStep.fields.includes('email' as any) || currentStep.fields.includes('password' as any)) {
      if (!state.email.trim() || !state.password.trim()) {
        setError('Введите email и пароль');
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setError(null);
    setStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  const prev = () => {
    setError(null);
    setStep(prev => Math.max(prev - 1, 0));
  };

  const submit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await register({
        email: state.email.trim(),
        password: state.password.trim(),
        name: state.name?.trim() || undefined,
        profile: {
          ...state.profile,
          age: Number(state.profile.age) || 0,
          weight_kg: Number(state.profile.weight_kg) || 0,
          height_cm: Number(state.profile.height_cm) || 0,
        },
      });
      setSession(res.token, res.user);
    } catch (e: any) {
      const msg = e?.message || 'Не удалось завершить онбординг';
      setError(msg);
      notifyError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.badge}>Шаг {step + 1} / {steps.length}</Text>
          <Text style={styles.title}>{currentStep.title}</Text>
          <Text style={styles.subtitle}>{currentStep.description}</Text>
        </View>

        <View style={styles.card}>
          {currentStep.fields.includes('email' as any) && (
            <TextField
              label="Email"
              value={state.email}
              onChangeText={value => updateField('email', value)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          )}
          {currentStep.fields.includes('password' as any) && (
            <TextField
              label="Пароль"
              value={state.password}
              secureTextEntry
              onChangeText={value => updateField('password', value)}
            />
          )}
          {currentStep.fields.includes('name' as any) && (
            <TextField
              label="Имя"
              value={state.name}
              onChangeText={value => updateField('name', value)}
            />
          )}
          {currentStep.fields.includes('goal' as any) && (
            <TextField
              label="Цель"
              value={state.profile.goal}
              onChangeText={value => updateProfileField('goal', value)}
              placeholder="strength / cut / hypertrophy"
            />
          )}
          {currentStep.fields.includes('level' as any) && (
            <TextField
              label="Уровень"
              value={state.profile.level}
              onChangeText={value => updateProfileField('level', value)}
              placeholder="beginner / intermediate"
            />
          )}
          {currentStep.fields.includes('age' as any) && (
            <Stepper
              label="Возраст"
              value={Number(state.profile.age) || 0}
              onChange={value => updateProfileField('age', value)}
              min={1}
            />
          )}
          {currentStep.fields.includes('height_cm' as any) && (
            <Stepper
              label="Рост (см)"
              value={Number(state.profile.height_cm) || 0}
              onChange={value => updateProfileField('height_cm', value)}
              min={50}
              step={1}
            />
          )}
          {currentStep.fields.includes('weight_kg' as any) && (
            <Stepper
              label="Вес (кг)"
              value={Number(state.profile.weight_kg) || 0}
              onChange={value => updateProfileField('weight_kg', value)}
              min={20}
              step={1}
            />
          )}
          {currentStep.fields.includes('equipment' as any) && (
            <TextField
              label="Оборудование"
              value={state.profile.equipment}
              onChangeText={value => updateProfileField('equipment', value)}
              placeholder="гантели, штанга"
            />
          )}
          {currentStep.fields.includes('health_limitations' as any) && (
            <TextField
              label="Ограничения"
              value={state.profile.health_limitations}
              onChangeText={value => updateProfileField('health_limitations', value)}
              placeholder="нет"
            />
          )}
          {currentStep.fields.includes('preferred_schedule_notes' as any) && (
            <TextField
              label="Пожелания к графику"
              value={state.profile.preferred_schedule_notes}
              onChangeText={value => updateProfileField('preferred_schedule_notes', value)}
              placeholder="пн/ср/пт"
            />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.footer}>
          <PrimaryButton title="Назад" variant="ghost" onPress={prev} disabled={step === 0 || loading} />
          {step < steps.length - 1 ? (
            <PrimaryButton title="Далее" onPress={next} disabled={loading} />
          ) : (
            <PrimaryButton title="Завершить" onPress={submit} loading={loading} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    container: {
      padding: 16,
      gap: 16,
    },
    header: {
      gap: 8,
    },
    badge: {
      color: colors.muted,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      fontFamily: 'Inter-Bold',
    },
    subtitle: {
      color: colors.muted,
      fontSize: 14,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
    },
    error: {
      color: colors.danger,
      fontSize: 14,
      marginTop: 4,
    },
  });
