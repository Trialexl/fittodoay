import React, { useMemo } from 'react';
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
import { colors } from '../theme/colors';

export function AssistantScreen() {
  const token = useToken();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AssistantRequest>({
    defaultValues: {
      goal: '',
      experience: '',
      sessions_per_week: 3,
      equipment: '',
      constraints: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (payload: AssistantRequest) => {
      if (!token) {
        throw new Error('Нет токена для запроса ассистента');
      }
      return createProgramsWithAssistant(token, payload);
    },
    onError: (err: any) => {
      notifyError(err?.message || 'Не удалось создать программы');
    },
  });

  const programs = mutation.data?.programs || [];
  const fallbackError =
    mutation.isError &&
    ((mutation.error as any)?.status === 503 ||
      (mutation.error as Error).message?.includes('недоступно'))
      ? 'Создание через помощника недоступно…'
      : null;

  const onSubmit = (values: AssistantRequest) => {
    mutation.mutate(values);
  };

  const formDisabled = !token || mutation.isLoading;

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
          <Controller
            control={control}
            name="goal"
            rules={{ required: 'Опишите цель' }}
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Цель"
                placeholder="Набор мышечной массы / похудение / выносливость"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.goal?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="experience"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Опыт"
                placeholder="Новичок / Средний / Продвинутый"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value || ''}
              />
            )}
          />

          <Controller
            control={control}
            name="sessions_per_week"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Тренировок в неделю"
                placeholder="3"
                keyboardType="number-pad"
                onBlur={onBlur}
                onChangeText={text => onChange(Number(text))}
                value={value ? String(value) : ''}
              />
            )}
          />

          <Controller
            control={control}
            name="equipment"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Доступное оборудование"
                placeholder="Штанга, гантели, турник..."
                onBlur={onBlur}
                onChangeText={onChange}
                value={value || ''}
              />
            )}
          />

          <Controller
            control={control}
            name="constraints"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Ограничения / травмы"
                placeholder="Боли в коленях, избегать беговых нагрузок..."
                onBlur={onBlur}
                onChangeText={onChange}
                value={value || ''}
              />
            )}
          />

          {mutation.isError && !fallbackError ? (
            <Text style={styles.errorText}>
              {(mutation.error as Error).message || 'Не удалось создать программы'}
            </Text>
          ) : null}
          {fallbackError ? <Text style={styles.errorText}>{fallbackError}</Text> : null}

          <PrimaryButton
            title={mutation.isLoading ? 'Создаем...' : 'Создать с помощником'}
            onPress={handleSubmit(onSubmit)}
            disabled={formDisabled}
            loading={mutation.isLoading}
          />
          {!token ? (
            <Text style={styles.helper}>Войдите, чтобы использовать ассистента.</Text>
          ) : null}
        </View>

        <View style={styles.resultSection}>
          <Text style={styles.resultTitle}>Сгенерированные программы</Text>
          {mutation.isLoading ? (
            <ActivityIndicator color="#f2b200" />
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
          {mutation.data?.message ? (
            <Text style={styles.helper}>{mutation.data.message}</Text>
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

const styles = StyleSheet.create({
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
