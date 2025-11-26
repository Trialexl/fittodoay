import { useEffect, useState } from "react";

import { ScrollView, StyleSheet, Text, View } from "react-native";

import { analyticsApi, DailyLoadItem, ExerciseLoadItem, ProgramTrendFolder } from "../api/analytics";
import { palette, radius, spacing, textStyles } from "../theme";

export const AnalyticsScreen = () => {
  const [daily, setDaily] = useState<DailyLoadItem[]>([]);
  const [exercises, setExercises] = useState<ExerciseLoadItem[]>([]);
  const [trends, setTrends] = useState<ProgramTrendFolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const [dailyRes, exRes, trendsRes] = await Promise.all([
        analyticsApi.getDailyLoads(),
        analyticsApi.getExerciseLoads(),
        analyticsApi.getProgramTrends(),
      ]);
      setDaily(dailyRes.items);
      setExercises(exRes.items);
      setTrends(trendsRes.folders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить аналитику");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Аналитика</Text>
      <Text style={styles.subtitle}>
        Нагрузка по дням, топ упражнений и динамика программ. Графики будут на victory-native, пока показываем карточки.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Нагрузка по дням</Text>
        {isLoading && daily.length === 0 ? <Text style={styles.meta}>Загрузка...</Text> : null}
        {daily.map((item) => (
          <View key={item.date} style={styles.row}>
            <Text style={styles.rowText}>{item.date}</Text>
            <Text style={styles.rowValue}>{item.load}</Text>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Топ упражнений</Text>
        {exercises.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.type === "system" ? "Каталог" : "Кастом"} • сетов: {item.sets}
              </Text>
            </View>
            <Text style={styles.rowValue}>{item.load}</Text>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Динамика программ</Text>
        {trends.map((folder) => (
          <View key={folder.id} style={styles.trendBlock}>
            <Text style={styles.rowText}>{folder.name}</Text>
            {folder.points.map((point) => (
              <View key={point.date} style={styles.row}>
                <Text style={styles.meta}>{point.date}</Text>
                <Text style={styles.rowValue}>{point.load}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
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
  card: {
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
  error: {
    ...textStyles.body,
    color: "#f87171",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  rowText: {
    ...textStyles.body,
  },
  rowValue: {
    ...textStyles.heading,
    fontSize: 16,
  },
  meta: {
    ...textStyles.caption,
    color: palette.textSecondary,
  },
  trendBlock: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
});
