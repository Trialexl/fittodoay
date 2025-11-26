import { useState } from "react";

import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { assistantApi } from "../api/assistant";
import { useAuth } from "../hooks/useAuth";
import { palette, radius, spacing, textStyles } from "../theme";

export const AssistantScreen = () => {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const handleGenerate = async () => {
    if (!token) {
      setError("Нужно войти");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const response = await assistantApi.generatePrograms();
      setResult(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось запустить ассистента");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>LLM Assistant</Text>
      <Text style={styles.subtitle}>
        Ассистент создаёт программы по вашему профилю и каталогу упражнений через /api/llm-agent/programs/.
        Позже здесь появится визард предпочтений и просмотр ответов, аналогичный вебу.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Создать программы</Text>
        <Text style={styles.cardText}>
          Текущий запуск использует сохранённый профиль и ограничения из backend. Результат появится ниже.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleGenerate}
          disabled={isLoading}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>{isLoading ? "Запускаем..." : "Сгенерировать"}</Text>
        </TouchableOpacity>
      </View>
      {result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ответ</Text>
          <Text style={styles.code}>{JSON.stringify(result, null, 2)}</Text>
        </View>
      ) : null}
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
  cardText: {
    ...textStyles.body,
  },
  button: {
    backgroundColor: palette.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    ...textStyles.heading,
    color: palette.background,
    fontSize: 16,
  },
  error: {
    ...textStyles.body,
    color: "#f87171",
  },
  code: {
    ...textStyles.body,
    color: palette.textSecondary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
  },
});
