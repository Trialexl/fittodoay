import { useEffect, useMemo, useState } from "react";

import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { DayTemplate, programsApi, ProgramFolder, TemplateExercise } from "../api/programs";
import { useAuth } from "../hooks/useAuth";
import { palette, radius, spacing, textStyles } from "../theme";

export const ProgramsScreen = () => {
  const { token } = useAuth();
  const [folders, setFolders] = useState<ProgramFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [templates, setTemplates] = useState<DayTemplate[]>([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const loadFolders = async () => {
    if (!token) return;
    setError(null);
    setIsLoading(true);
    try {
      const data = await programsApi.listFolders();
      setFolders(data);
      const initial = data.find((item) => item.is_active) || data[0];
      setSelectedFolderId(initial ? initial.id : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить программы");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFolders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadTemplates = async (folderId: number | null) => {
    if (!token || !folderId) return;
    setTemplatesError(null);
    setIsTemplatesLoading(true);
    try {
      const data = await programsApi.listTemplates(folderId);
      setTemplates(data);
    } catch (e) {
      setTemplatesError(e instanceof Error ? e.message : "Не удалось загрузить шаблоны");
      setTemplates([]);
    } finally {
      setIsTemplatesLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates(selectedFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFolderId, token]);

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) || null,
    [folders, selectedFolderId],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Программы</Text>
      <Text style={styles.subtitle}>
        Program Board: папки и шаблоны с drag&drop, модалки упражнений и синхронизация с backend.
        Ниже — ваши папки и дни.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        horizontal
        data={folders}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.folderChips}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadFolders} tintColor={palette.accent} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelectedFolderId(item.id)}
            style={[
              styles.folderChip,
              selectedFolderId === item.id && styles.folderChipActive,
            ]}
            activeOpacity={0.9}
          >
            <Text
              style={[styles.folderChipText, selectedFolderId === item.id && styles.folderChipTextActive]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>Нет папок.</Text> : null}
        showsHorizontalScrollIndicator={false}
      />
      {currentFolder && currentFolder.comment ? <Text style={styles.meta}>{currentFolder.comment}</Text> : null}
      {templatesError ? <Text style={styles.error}>{templatesError}</Text> : null}
      <FlatList
        data={templates}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isTemplatesLoading} onRefresh={() => loadTemplates(selectedFolderId)} tintColor={palette.accent} />
        }
        renderItem={({ item }) => <TemplateCard template={item} />}
        ListEmptyComponent={
          !isTemplatesLoading ? <Text style={styles.empty}>Нет шаблонов в папке.</Text> : null
        }
      />
    </ScrollView>
  );
};

const TemplateCard = ({ template }: { template: DayTemplate }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <Text style={styles.cardTitle}>{template.name}</Text>
      {template.is_active ? <Text style={styles.badge}>Active</Text> : null}
    </View>
    {template.comment ? <Text style={styles.cardComment}>{template.comment}</Text> : null}
    <View style={styles.exList}>
      {template.template_exercises.map((exercise) => (
        <ExerciseRow key={exercise.id} exercise={exercise} />
      ))}
    </View>
  </View>
);

const ExerciseRow = ({ exercise }: { exercise: TemplateExercise }) => {
  const name = exercise.exercise?.name ?? exercise.custom_exercise?.name ?? "Упражнение";
  const muscles = exercise.exercise?.main_muscle;
  const metaParts = [];
  if (exercise.set_override) metaParts.push(`${exercise.set_override}×`);
  if (exercise.rep_override) metaParts.push(`${exercise.rep_override} повт`);
  if (exercise.weight_override) metaParts.push(`${exercise.weight_override} кг`);
  if (exercise.time_override) metaParts.push(`${exercise.time_override} сек`);
  const meta = metaParts.join(" • ");

  return (
    <View style={styles.exerciseRow}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={styles.exerciseName}>{name}</Text>
        {muscles ? <Text style={styles.exerciseMuscle}>{muscles}</Text> : null}
        {meta ? <Text style={styles.exerciseMeta}>{meta}</Text> : null}
      </View>
      {!exercise.is_active ? <Text style={styles.exerciseBadge}>off</Text> : null}
    </View>
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
  error: {
    ...textStyles.body,
    color: "#f87171",
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardTitle: {
    ...textStyles.heading,
    fontSize: 18,
  },
  badge: {
    backgroundColor: palette.accent,
    color: palette.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    fontSize: 12,
    fontWeight: "700",
  },
  cardComment: {
    ...textStyles.body,
  },
  empty: {
    ...textStyles.body,
    color: palette.muted,
  },
  folderChips: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  folderChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  folderChipActive: {
    borderColor: palette.accent,
  },
  folderChipText: {
    ...textStyles.body,
  },
  folderChipTextActive: {
    color: palette.accent,
    fontWeight: "700",
  },
  exList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: palette.surface,
  },
  exerciseName: {
    ...textStyles.body,
    fontWeight: "700",
  },
  exerciseMuscle: {
    ...textStyles.caption,
    color: palette.muted,
  },
  exerciseMeta: {
    ...textStyles.caption,
    color: palette.textSecondary,
  },
  exerciseBadge: {
    ...textStyles.caption,
    color: palette.background,
    backgroundColor: palette.muted,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  meta: {
    ...textStyles.caption,
    color: palette.muted,
  },
});
