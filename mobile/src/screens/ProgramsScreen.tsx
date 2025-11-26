import { useEffect, useState } from "react";

import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { programsApi, ProgramFolder } from "../api/programs";
import { useAuth } from "../hooks/useAuth";
import { palette, radius, spacing, textStyles } from "../theme";

export const ProgramsScreen = () => {
  const { token } = useAuth();
  const [folders, setFolders] = useState<ProgramFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = async () => {
    if (!token) return;
    setError(null);
    setIsLoading(true);
    try {
      const data = await programsApi.listFolders();
      setFolders(data);
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Программы</Text>
      <Text style={styles.subtitle}>
        Program Board: папки и шаблоны с drag&drop, модалки упражнений и синхронизация с backend.
        Ниже — ваши текущие папки.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={folders}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadFolders} tintColor={palette.accent} />}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.is_active ? <Text style={styles.badge}>Active</Text> : null}
            </View>
            {item.comment ? <Text style={styles.cardComment}>{item.comment}</Text> : null}
            <Text style={styles.meta}>Sort: {item.sort_order}</Text>
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>Нет папок. Создайте на вебе или через ассистента.</Text> : null
        }
      />
    </View>
  );
};

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
  meta: {
    ...textStyles.caption,
    color: palette.muted,
  },
  empty: {
    ...textStyles.body,
    color: palette.muted,
  },
});
