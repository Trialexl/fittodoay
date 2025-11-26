import { useEffect, useState } from "react";

import { FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { WorkoutPlan, WorkoutPlanExercise, WorkoutSetLog, workoutApi } from "../api/workout";
import { palette, radius, spacing, textStyles } from "../theme";

export const WorkoutScreen = () => {
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [logs, setLogs] = useState<WorkoutSetLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");

  const loadPlan = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await workoutApi.getPlan(selectedDate || undefined);
      setPlan(data);
      setLogs(data.set_logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить план");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPlan();
  }, []);

  const handleQuickLog = async (exerciseId: number, setIndex: number) => {
    if (!plan) return;
    const key = `${exerciseId}:${setIndex}`;
    setSavingKey(key);
    try {
      const payload = {
        workout_day: plan.id,
        template_exercise: exerciseId,
        set_index: setIndex,
        actual_reps: 1,
      };
      const log = await workoutApi.logSet(payload);
      setLogs((prev) => [...prev, log]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось записать сет");
    } finally {
      setSavingKey(null);
    }
  };

  const isSetLogged = (exerciseId: number, setIndex: number) =>
    logs.some((log) => log.template_exercise === exerciseId && log.set_index === setIndex);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Тренировка</Text>
      <Text style={styles.subtitle}>
        Чеклист сетов с быстрыми отметками. Позже добавим офлайн-очередь, RestTimer и интервалы.
      </Text>
      <View style={styles.dateRow}>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={palette.muted}
          value={selectedDate}
          onChangeText={setSelectedDate}
        />
        <TouchableOpacity style={styles.reloadButton} onPress={loadPlan} activeOpacity={0.9}>
          <Text style={styles.reloadText}>Загрузить</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={plan?.plan_snapshot.folders ?? []}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadPlan} tintColor={palette.accent} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.folderCard}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.templates.map((template) => (
              <View key={template.id} style={styles.templateCard}>
                <Text style={styles.templateName}>{template.name}</Text>
                {template.exercises.map((exercise) => (
                  <ExerciseRow
                    key={exercise.template_exercise_id}
                    exercise={exercise}
                    isSetLogged={isSetLogged}
                    onLog={handleQuickLog}
                    savingKey={savingKey}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>Нет плана на сегодня.</Text> : null}
      />
    </View>
  );
};

const ExerciseRow = ({
  exercise,
  isSetLogged,
  onLog,
  savingKey,
}: {
  exercise: WorkoutPlanExercise;
  isSetLogged: (exerciseId: number, setIndex: number) => boolean;
  onLog: (exerciseId: number, setIndex: number) => void;
  savingKey: string | null;
}) => (
  <View style={styles.exerciseRow}>
    <View style={{ flex: 1, gap: spacing.xs }}>
      <Text style={styles.exerciseName}>{exercise.source.name}</Text>
      {exercise.note ? <Text style={styles.exerciseNote}>{exercise.note}</Text> : null}
    </View>
    <View style={styles.sets}>
      {exercise.sets.map((set) => {
        const done = isSetLogged(exercise.template_exercise_id, set.set_index);
        const key = `${exercise.template_exercise_id}:${set.set_index}`;
        return (
          <TouchableOpacity
            key={set.set_index}
            onPress={() => onLog(exercise.template_exercise_id, set.set_index)}
            style={[
              styles.setBubble,
              done && styles.setBubbleDone,
              savingKey === key && styles.setBubbleSaving,
            ]}
            activeOpacity={0.8}
            disabled={savingKey === key}
          >
            <Text style={[styles.setText, done && styles.setTextDone]}>{set.set_index}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...textStyles.heading,
  },
  subtitle: {
    ...textStyles.body,
    color: palette.textSecondary,
  },
  error: {
    ...textStyles.body,
    color: "#f87171",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reloadButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.accent,
    borderRadius: radius.md,
  },
  reloadText: {
    ...textStyles.heading,
    color: palette.background,
    fontSize: 14,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  folderCard: {
    backgroundColor: palette.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    ...textStyles.heading,
    fontSize: 18,
  },
  templateCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  templateName: {
    ...textStyles.body,
    fontWeight: "700",
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  exerciseName: {
    ...textStyles.body,
  },
  exerciseNote: {
    ...textStyles.caption,
    color: palette.muted,
  },
  sets: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  setBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
  },
  setBubbleDone: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  setBubbleSaving: {
    opacity: 0.6,
  },
  setText: {
    ...textStyles.caption,
    color: palette.textSecondary,
    fontWeight: "700",
  },
  setTextDone: {
    color: palette.background,
  },
  empty: {
    ...textStyles.body,
    color: palette.muted,
  },
});
