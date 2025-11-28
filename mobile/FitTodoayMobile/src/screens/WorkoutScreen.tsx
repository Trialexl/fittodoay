import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  RefreshControl,
  Button,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Screen } from '../components/Screen';
import { useToken } from '../hooks/useToken';
import { fetchWorkoutPlan, logWorkoutSet, PlanFolder, PlanTemplate, PlanExercise } from '../api/workout';
import { fetchRecommendations, applyRecommendation, Recommendation } from '../api/recommendations';
import { useOfflineQueueSync, enqueueLog } from '../state/offlineQueue';
import { useOnline } from '../hooks/useOnline';
import { useState } from 'react';
import { notifyError } from '../utils/notify';

export function WorkoutScreen() {
  const token = useToken();
  const queryClient = useQueryClient();
  const online = useOnline();
  useOfflineQueueSync();
  const [setCounters, setSetCounters] = useState<Record<number, number>>({});

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['workoutPlan'],
    queryFn: () => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return fetchWorkoutPlan(token);
    },
    enabled: Boolean(token),
  });

  const recsQuery = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return fetchRecommendations(token);
    },
    enabled: Boolean(token),
  });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof logWorkoutSet>[1]) => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return logWorkoutSet(token, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutPlan'] });
    },
    onError: async (err, variables) => {
      if (!online) {
        await enqueueLog(variables);
      }
    },
  });

  const applyRecMutation = useMutation({
    mutationFn: (rec: Recommendation) => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return applyRecommendation(token, rec);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutPlan'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
    onError: (err: any) => {
      notifyError(err?.message || 'Не удалось применить рекомендацию');
    },
  });

  const dateText = useMemo(() => {
    if (!data?.date) return '';
    return format(new Date(data.date), 'dd MMMM yyyy');
  }, [data?.date]);

  const renderExercise = (exercise: PlanExercise) => (
    <View key={exercise.id} style={styles.exercise}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseTitle}>{exercise.name}</Text>
        {exercise.rest_seconds ? (
          <Text style={styles.muted}>Отдых: {exercise.rest_seconds}s</Text>
        ) : null}
      </View>
      <Text style={styles.muted}>
        Сетов: {exercise.sets}
        {exercise.reps ? ` • Повторы: ${exercise.reps}` : ''}
        {exercise.weight ? ` • Вес: ${exercise.weight}кг` : ''}
        {exercise.time_seconds ? ` • Время: ${exercise.time_seconds}s` : ''}
      </Text>
      <View style={styles.counterRow}>
        <Text style={styles.muted}>
          Выполнено: {setCounters[exercise.template_exercise] || 0}/{exercise.sets}
        </Text>
        <Pressable
          style={[styles.logButton, !online && styles.logButtonOffline]}
          onPress={() => {
            const nextIndex = setCounters[exercise.template_exercise] || 0;
            const payload = {
              workout_day: data?.workout_day_id || 0,
              template_exercise: exercise.template_exercise,
              set_index: nextIndex,
              reps: exercise.reps,
              weight: exercise.weight,
              time_seconds: exercise.time_seconds,
            };
            mutation.mutate(payload, {
              onSuccess: () => {
                setSetCounters(prev => ({
                  ...prev,
                  [exercise.template_exercise]: Math.min(nextIndex + 1, exercise.sets),
                }));
              },
              onError: async () => {
                if (!online) {
                  await enqueueLog(payload);
                  setSetCounters(prev => ({
                    ...prev,
                    [exercise.template_exercise]: Math.min(nextIndex + 1, exercise.sets),
                  }));
                }
              },
            });
          }}>
          <Text style={styles.logButtonText}>
            {online ? 'Отметить сет' : 'Отметить (в очередь)'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderTemplate = (template: PlanTemplate) => (
    <View key={template.id} style={styles.templateCard}>
      <View style={styles.templateHeader}>
        <Text style={styles.templateTitle}>{template.name}</Text>
        {!template.is_active ? <Text style={styles.badge}>Не активен</Text> : null}
      </View>
      <View style={{ gap: 12 }}>
        {template.exercises.map(ex => renderExercise(ex))}
      </View>
    </View>
  );

  const renderFolder = ({ item }: { item: PlanFolder }) => (
    <View style={styles.folderCard}>
      <View style={styles.folderHeader}>
        <Text style={styles.folderTitle}>{item.name}</Text>
        {!item.is_active ? <Text style={styles.badge}>Не активна</Text> : null}
      </View>
      <View style={{ gap: 14 }}>{item.templates.map(t => renderTemplate(t))}</View>
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Чеклист</Text>
        <Text style={styles.subtitle}>{dateText || 'Сегодняшний план'}</Text>
        {!online ? (
          <Text style={styles.offlineNote}>
            Офлайн: отметки сохранятся в очереди и отправятся позже.
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f2b200" />
        </View>
      ) : error ? (
        <Text style={styles.errorText}>Не удалось загрузить план</Text>
      ) : (
        <FlatList
          data={data?.folders || []}
          keyExtractor={item => String(item.id)}
          renderItem={renderFolder}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#f2b200" />
          }
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListEmptyComponent={<Text style={styles.empty}>Нет активных тренировок</Text>}
          ListFooterComponent={
            <View style={{ marginTop: 16 }}>
              <Text style={styles.title}>Рекомендации</Text>
              {recsQuery.isLoading ? (
                <ActivityIndicator color="#f2b200" />
              ) : recsQuery.error ? (
                <Text style={styles.errorText}>Не удалось загрузить рекомендации</Text>
              ) : recsQuery.data && recsQuery.data.length > 0 ? (
                recsQuery.data.map(rec => (
                  <View key={rec.id} style={styles.recCard}>
                    <Text style={styles.exerciseTitle}>{rec.exercise_name || 'Упражнение'}</Text>
                    {rec.note ? <Text style={styles.muted}>{rec.note}</Text> : null}
                    <Button
                      title="Применить"
                      onPress={() => applyRecMutation.mutate(rec)}
                      disabled={applyRecMutation.isLoading}
                    />
                  </View>
                ))
              ) : (
                <Text style={styles.muted}>Рекомендаций пока нет</Text>
              )}
            </View>
          }
        />
      )}
    </Screen>
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
    color: '#f5f7fb',
  },
  subtitle: {
    color: '#c3cad5',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderCard: {
    backgroundColor: '#0f1626',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e2740',
    gap: 10,
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  folderTitle: {
    color: '#f5f7fb',
    fontWeight: '700',
    fontSize: 18,
  },
  badge: {
    color: '#ffba08',
    fontSize: 12,
  },
  offlineNote: {
    color: '#ffba08',
    fontSize: 13,
  },
  templateCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e2740',
    padding: 10,
    gap: 10,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  templateTitle: {
    color: '#f5f7fb',
    fontWeight: '700',
    fontSize: 16,
  },
  exercise: {
    backgroundColor: '#131b2b',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseTitle: {
    color: '#f5f7fb',
    fontWeight: '700',
    fontSize: 15,
  },
  muted: {
    color: '#c3cad5',
    fontSize: 13,
  },
  errorText: {
    color: '#ff6b6b',
  },
  empty: {
    color: '#c3cad5',
    textAlign: 'center',
    marginTop: 12,
  },
  recCard: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#0f1626',
    borderWidth: 1,
    borderColor: '#1e2740',
    gap: 6,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  logButton: {
    backgroundColor: '#f2b200',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logButtonOffline: {
    backgroundColor: '#4a4f5a',
  },
  logButtonText: {
    color: '#0b0f1a',
    fontWeight: '700',
  },
});
