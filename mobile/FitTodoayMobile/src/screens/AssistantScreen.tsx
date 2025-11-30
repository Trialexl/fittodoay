import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { useToken } from '../hooks/useToken';
import {
  AssistantProgram,
  AssistantRequest,
  createProgramsWithAssistant,
} from '../api/assistant';
import { notifyError } from '../utils/notify';
import { useThemedColors } from '../theme/colors';
import { fetchPreferences, savePreferences } from '../api/profile';
import { MainTabParamList } from '../navigation/types';

type FormValues = {
  gender: string;
  age: string;
  weight_kg: string;
  height_cm: string;
  goal: string;
  sessions_per_week: string;
  session_duration: string;
  notes: string;
  experience: string;
  equipment: string;
  constraints: string;
};

const defaultValues: FormValues = {
  gender: 'male',
  age: '30',
  weight_kg: '80',
  height_cm: '180',
  goal: 'cut',
  sessions_per_week: '3',
  session_duration: '60',
  notes: '',
  experience: '',
  equipment: '',
  constraints: '',
};

const normalizeNumber = (value: string) => {
  if (!value) return null;
  const num = Number(value.replace(',', '.'));
  return Number.isNaN(num) ? null : num;
};

export function AssistantScreen() {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const token = useToken();
  const navigation = useNavigation<any>();
  const [step, setStep] = useState(0);
  const [prefetched, setPrefetched] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    trigger,
  } = useForm<FormValues>({
    defaultValues,
  });

  const savePrefsMutation = useMutation({
    mutationFn: (payload: AssistantRequest) => {
      if (!token) throw new Error('Нет токена для сохранения предпочтений');
      return savePreferences(token, {
        gender: payload.gender,
        age: payload.age,
        weight_kg: payload.weight_kg,
        height_cm: payload.height_cm,
        goal: payload.goal,
        sessions_per_week: payload.sessions_per_week,
        session_duration: payload.session_duration,
        notes: payload.notes,
        experience: payload.experience,
        equipment: payload.equipment,
        constraints: payload.constraints,
      });
    },
  });

  const assistantMutation = useMutation({
    mutationFn: (payload: AssistantRequest) => {
      if (!token) {
        throw new Error('Нет токена для запроса ассистента');
      }
      return createProgramsWithAssistant(token, payload);
    },
    onSuccess: () => {
      setFallbackError(null);
      setDebugError(null);
    },
    onError: (err: any) => {
      const msg = err?.message || 'Не удалось создать программы';
      const is503 = err?.status === 503 || /недоступно/i.test(msg);
      const invalidJson = /json/i.test(msg);
      if (is503 || invalidJson) {
        setFallbackError('Создание через помощника недоступно. Попробуйте чуть позже или вручную создайте программу.');
      }
      setDebugError(msg);
      notifyError(msg);
    },
  });

  const programs = assistantMutation.data?.programs || [];

  const steps = useMemo(
    () => [
      { title: 'Основная информация', fields: ['gender', 'age', 'weight_kg', 'height_cm'] as const },
      { title: 'Цель', fields: ['goal'] as const },
      { title: 'Режим', fields: ['sessions_per_week', 'session_duration'] as const },
      { title: 'Дополнительно', fields: ['notes', 'experience', 'equipment', 'constraints'] as const },
    ],
    [],
  );

  const currentStep = steps[step];

  const goNext = async () => {
    if (!currentStep) return;
    const valid = await trigger(currentStep.fields as any, { shouldFocus: true });
    if (valid) {
      setStep(prev => Math.min(steps.length - 1, prev + 1));
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!token) {
      notifyError('Авторизуйтесь, чтобы использовать ассистента');
      return;
    }
    setFallbackError(null);
    const payload: AssistantRequest = {
      gender: values.gender || null,
      age: normalizeNumber(values.age),
      weight_kg: normalizeNumber(values.weight_kg),
      height_cm: normalizeNumber(values.height_cm),
      goal: values.goal || null,
      sessions_per_week: normalizeNumber(values.sessions_per_week),
      session_duration: normalizeNumber(values.session_duration),
      notes: values.notes?.trim() ? values.notes.trim() : null,
      experience: values.experience?.trim() || null,
      equipment: values.equipment?.trim() || null,
      constraints: values.constraints?.trim() || null,
    };
    try {
      await savePrefsMutation.mutateAsync(payload);
    } catch (err: any) {
      notifyError(err?.message || 'Не удалось сохранить предпочтения');
      // не блокируем ассистента из-за ошибки сохранения
    }
    assistantMutation.mutate(payload);
    setStep(steps.length - 1);
  };

  useEffect(() => {
    if (!token || prefetched) return;
    fetchPreferences(token)
      .then((data) => {
        if (data) {
          if (data.gender) setValue('gender', String(data.gender));
          if (data.age != null) setValue('age', String(data.age));
          if (data.weight_kg != null) setValue('weight_kg', String(data.weight_kg));
          if (data.height_cm != null) setValue('height_cm', String(data.height_cm));
          if (data.goal) setValue('goal', String(data.goal));
          if (data.sessions_per_week != null) setValue('sessions_per_week', String(data.sessions_per_week));
          if (data.session_duration != null) setValue('session_duration', String(data.session_duration));
          if (data.notes) setValue('notes', String(data.notes));
          if (data.experience) setValue('experience', String(data.experience));
          if (data.equipment) setValue('equipment', String(data.equipment));
          if (data.constraints) setValue('constraints', String(data.constraints));
          setPrefetched(true);
        }
      })
      .catch(() => null);
  }, [token, prefetched, setValue]);

  const formDisabled = !token || assistantMutation.isLoading;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Ассистент</Text>
          <Text style={styles.subtitle}>
            Заполните цели и предпочтения — ассистент создаст программы и дни тренировок.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.helper}>Шаг {Math.min(step + 1, steps.length)} / {steps.length}: {currentStep?.title}</Text>

          {currentStep?.fields.includes('gender') && (
            <Controller
              control={control}
              name="gender"
              rules={{ required: 'Укажите пол (male/female)' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Пол"
                  placeholder="male / female"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.gender?.message}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('age') && (
            <Controller
              control={control}
              name="age"
              rules={{ required: 'Укажите возраст' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Возраст"
                  placeholder="30"
                  keyboardType="number-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.age?.message}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('weight_kg') && (
            <Controller
              control={control}
              name="weight_kg"
              rules={{ required: 'Введите вес' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Вес (кг)"
                  placeholder="80"
                  keyboardType="decimal-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.weight_kg?.message}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('height_cm') && (
            <Controller
              control={control}
              name="height_cm"
              rules={{ required: 'Введите рост' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Рост (см)"
                  placeholder="180"
                  keyboardType="number-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.height_cm?.message}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('goal') && (
            <Controller
              control={control}
              name="goal"
              rules={{ required: 'Опишите цель' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Цель"
                  placeholder="Рельеф / Сила / Масса / Выносливость"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.goal?.message}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('sessions_per_week') && (
            <Controller
              control={control}
              name="sessions_per_week"
              rules={{ required: 'Укажите частоту' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Тренировок в неделю"
                  placeholder="3"
                  keyboardType="number-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.sessions_per_week?.message}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('session_duration') && (
            <Controller
              control={control}
              name="session_duration"
              rules={{ required: 'Укажите длительность' }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Длительность тренировки (мин)"
                  placeholder="60"
                  keyboardType="number-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  error={errors.session_duration?.message}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('notes') && (
            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Пожелания"
                  placeholder="Предпочитаю тренажеры, есть ограничения для спины..."
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  multiline
                  style={{ height: 96, textAlignVertical: 'top' }}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('experience') && (
            <Controller
              control={control}
              name="experience"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Опыт"
                  placeholder="Новичок / Средний / Продвинутый"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('equipment') && (
            <Controller
              control={control}
              name="equipment"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Доступное оборудование"
                  placeholder="Штанга, гантели, турник..."
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
          )}

          {currentStep?.fields.includes('constraints') && (
            <Controller
              control={control}
              name="constraints"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Ограничения / травмы"
                  placeholder="Боли в коленях, избегать беговых нагрузок..."
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              )}
            />
          )}

          {assistantMutation.isError && !fallbackError ? (
            <Text style={styles.errorText}>
              {(assistantMutation.error as Error).message || 'Не удалось создать программы'}
            </Text>
          ) : null}
          {fallbackError ? (
            <View style={styles.fallbackBox}>
              <Text style={styles.errorText}>{fallbackError}</Text>
              {debugError ? <Text style={styles.debugText}>{debugError}</Text> : null}
              <PrimaryButton
                title="Попробовать снова"
                variant="ghost"
                onPress={() => {
                  setFallbackError(null);
                  setDebugError(null);
                  assistantMutation.reset();
                }}
              />
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <PrimaryButton
              title="Назад"
              variant="ghost"
              onPress={() => setStep(prev => Math.max(0, prev - 1))}
              disabled={step === 0 || formDisabled}
            />
            {step < steps.length - 1 ? (
              <PrimaryButton
                title="Далее"
                onPress={goNext}
                disabled={formDisabled}
              />
            ) : (
              <PrimaryButton
                title={assistantMutation.isLoading ? 'Создаем...' : 'Создать с помощником'}
                onPress={handleSubmit(onSubmit)}
                disabled={formDisabled}
                loading={assistantMutation.isLoading}
              />
            )}
          </View>
          {!token ? (
            <Text style={styles.helper}>Войдите, чтобы использовать ассистента.</Text>
          ) : null}
        </View>

        <View style={styles.resultSection}>
          <Text style={styles.resultTitle}>Сгенерированные программы</Text>
          {assistantMutation.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : programs.length === 0 ? (
            <Text style={styles.muted}>Программы появятся после генерации.</Text>
          ) : (
            <FlatList
              data={programs}
              keyExtractor={(item, idx) => `${item.name}-${idx}`}
              renderItem={({ item }) => <ProgramCard program={item} />}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          )}
          {assistantMutation.data?.message ? (
            <Text style={styles.helper}>{assistantMutation.data.message}</Text>
          ) : null}
          {programs.length > 0 ? (
            <View style={styles.actionsRow}>
              <PrimaryButton
                title="К программам"
                onPress={() => navigation.navigate('Programs' as keyof MainTabParamList)}
              />
              <PrimaryButton
                title="К чеклисту"
                variant="ghost"
                onPress={() => navigation.navigate('Workout' as keyof MainTabParamList)}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

function ProgramCard({ program }: { program: AssistantProgram }) {
  const days = program.days || [];
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{program.name}</Text>
        {program.is_active === false ? <Text style={styles.badge}>Отключена</Text> : null}
        {program.is_active ? <Text style={styles.badgeActive}>Активна</Text> : null}
      </View>
      {program.summary ? <Text style={styles.cardSubtitle}>{program.summary}</Text> : null}
      {days.length > 0 ? (
        <View style={styles.daysList}>
          {days.map((day, idx) => (
            <View key={idx} style={styles.dayItem}>
              <Text style={styles.dayTitle}>{day.name}</Text>
              {day.exercises_count ? (
                <Text style={styles.dayMeta}>{day.exercises_count} упражнений</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    header: {
      gap: 6,
      marginBottom: 12,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
    },
    subtitle: {
      color: colors.muted,
    },
    form: {
      gap: 10,
      marginBottom: 16,
    },
    helper: {
      color: colors.muted,
      fontSize: 13,
    },
    errorText: {
      color: colors.danger,
      fontSize: 14,
    },
    fallbackBox: {
      gap: 6,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    debugText: {
      color: colors.muted,
      fontSize: 12,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    resultSection: {
      gap: 8,
    },
    resultTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '700',
    },
    muted: {
      color: colors.muted,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '700',
    },
    cardSubtitle: {
      color: colors.muted,
      fontSize: 14,
    },
    badge: {
      color: colors.primary,
      fontSize: 12,
    },
    badgeActive: {
      color: colors.success,
      fontSize: 12,
    },
    daysList: {
      gap: 6,
    },
    dayItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    dayTitle: {
      color: colors.text,
    },
    dayMeta: {
      color: colors.muted,
      fontSize: 12,
    },
  });
