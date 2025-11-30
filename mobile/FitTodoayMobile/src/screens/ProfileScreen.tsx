import React, { useEffect, useMemo } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { ThemeSelector } from '../components/ThemeSelector';
import { useThemedColors } from '../theme/colors';
import { useAuthStore } from '../state/auth';
import { useToken } from '../hooks/useToken';
import { fetchPreferences, savePreferences } from '../api/profile';
import { notifyError, notifySuccess } from '../utils/notify';
import { TextField } from '../components/TextField';
import { useForm, Controller } from 'react-hook-form';

export function ProfileScreen() {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const token = useToken();
  const clearSession = useAuthStore(state => state.clearSession);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      gender: '',
      age: '',
      weight_kg: '',
      height_cm: '',
      goal: '',
      sessions_per_week: '',
      session_duration: '',
      notes: '',
      experience: '',
      equipment: '',
      constraints: '',
    },
  });

  useEffect(() => {
    if (!token) return;
    fetchPreferences(token)
      .then(data => {
        if (!data) return;
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
      })
      .catch(() => null);
  }, [setValue, token]);

  const onSubmit = async (values: any) => {
    if (!token) {
      notifyError('Нет токена');
      return;
    }
    try {
      await savePreferences(token, {
        gender: values.gender || null,
        age: values.age ? Number(values.age) : null,
        weight_kg: values.weight_kg ? Number(values.weight_kg) : null,
        height_cm: values.height_cm ? Number(values.height_cm) : null,
        goal: values.goal || null,
        sessions_per_week: values.sessions_per_week ? Number(values.sessions_per_week) : null,
        session_duration: values.session_duration ? Number(values.session_duration) : null,
        notes: values.notes?.trim() || null,
        experience: values.experience?.trim() || null,
        equipment: values.equipment?.trim() || null,
        constraints: values.constraints?.trim() || null,
      });
      notifySuccess('Сохранено');
    } catch (e: any) {
      notifyError(e?.message || 'Не удалось сохранить профиль');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 16, gap: 12 }}>
        <View style={styles.card}>
          <Text style={styles.title}>Профиль</Text>
          <Controller
            control={control}
            name="gender"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Пол" placeholder="male / female" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          <Controller
            control={control}
            name="age"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Возраст" placeholder="30" keyboardType="number-pad" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          <Controller
            control={control}
            name="weight_kg"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Вес (кг)" placeholder="80" keyboardType="decimal-pad" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          <Controller
            control={control}
            name="height_cm"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Рост (см)" placeholder="180" keyboardType="number-pad" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          <Controller
            control={control}
            name="goal"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Цель" placeholder="Рельеф / Сила / Масса / Выносливость" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          <Controller
            control={control}
            name="sessions_per_week"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Тренировок в неделю" placeholder="3" keyboardType="number-pad" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
          <Controller
            control={control}
            name="session_duration"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField label="Длительность тренировки (мин)" placeholder="60" keyboardType="number-pad" onBlur={onBlur} onChangeText={onChange} value={value} />
            )}
          />
        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Пожелания"
              placeholder="Ограничения, предпочтения..."
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              multiline
              style={{ height: 96, textAlignVertical: 'top' }}
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
              value={value}
            />
          )}
        />
        <Controller
          control={control}
          name="equipment"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Оборудование"
              placeholder="Штанга, гантели, турник..."
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        <Controller
          control={control}
          name="constraints"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Ограничения"
              placeholder="Боли в коленях, избегать беговых нагрузок..."
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        <Button title={isSubmitting ? 'Сохраняем...' : 'Сохранить профиль'} onPress={handleSubmit(onSubmit)} />
      </View>

        <View style={styles.card}>
          <Text style={styles.title}>Тема и акцент</Text>
          <ThemeSelector />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Сессия</Text>
          <Button title="Выйти" onPress={clearSession} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
    card: {
      marginTop: 16,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    title: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
  });
