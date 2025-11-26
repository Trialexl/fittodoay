import { useEffect, useMemo, useState } from "react";

import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { assistantApi } from "../api/assistant";
import { LlmPreferences, preferencesApi } from "../api/preferences";
import { useAuth } from "../hooks/useAuth";
import { palette, radius, spacing, textStyles } from "../theme";

type GenerateResultProgram = {
  name: string;
  days?: { name: string }[];
};

type GenerateResult = {
  programs?: GenerateResultProgram[];
} & Record<string, unknown>;

const GOAL_OPTIONS = [
  { value: "cut", label: "Рельеф" },
  { value: "strength", label: "Сила" },
  { value: "hypertrophy", label: "Гипертрофия" },
  { value: "endurance", label: "Выносливость" },
];

const THEME_OPTIONS = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

export const AssistantScreen = () => {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [preferences, setPreferences] = useState<Record<string, unknown> | null>(null);
  const [isPrefsLoading, setIsPrefsLoading] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [isPrefsSaving, setIsPrefsSaving] = useState(false);
  const [form, setForm] = useState<Partial<LlmPreferences>>({});

  const loadPreferences = async () => {
    if (!token) return;
    setPrefsError(null);
    setIsPrefsLoading(true);
    try {
      const prefs = await preferencesApi.getPreferences();
      setPreferences(prefs);
      setForm(prefs);
    } catch (e) {
      setPrefsError(e instanceof Error ? e.message : "Не удалось загрузить предпочтения");
      setPreferences(null);
      setForm({});
    } finally {
      setIsPrefsLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleGenerate = async () => {
    if (!token) {
      setError("Нужно войти");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const response = await assistantApi.generatePrograms();
      setResult(response as GenerateResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось запустить ассистента");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!token) {
      setPrefsError("Нужно войти");
      return;
    }
    setPrefsError(null);
    setIsPrefsSaving(true);
    try {
      const payload: Partial<LlmPreferences> = {
        ...form,
        sessions_per_week: form.sessions_per_week ? Number(form.sessions_per_week) : null,
        session_duration: form.session_duration ? Number(form.session_duration) : null,
      };
      const updated = await preferencesApi.updatePreferences(payload);
      setPreferences(updated);
      setForm(updated);
    } catch (e) {
      setPrefsError(e instanceof Error ? e.message : "Не удалось сохранить предпочтения");
    } finally {
      setIsPrefsSaving(false);
    }
  };

  const programsSummary = useMemo(() => {
    if (!result?.programs) return null;
    return result.programs.map((program) => ({
      name: program.name,
      days: program.days?.length ?? 0,
    }));
  }, [result]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>LLM Assistant</Text>
      <Text style={styles.subtitle}>
        Ассистент создаёт программы по вашему профилю и каталогу упражнений через /api/llm-agent/programs/.
        Позже здесь появится визард предпочтений и просмотр ответов, аналогичный вебу.
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Предпочтения (read-only)</Text>
        {isPrefsLoading ? <Text style={styles.meta}>Загрузка...</Text> : null}
        {prefsError ? <Text style={styles.error}>{prefsError}</Text> : null}
        <View style={styles.formRow}>
          <Text style={styles.label}>Цель</Text>
          <View style={styles.chipRow}>
            {GOAL_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, form.goal === option.value && styles.chipActive]}
                onPress={() => setForm((prev) => ({ ...prev, goal: option.value }))}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, form.goal === option.value && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.formRow}>
          <Text style={styles.label}>Сессий в неделю</Text>
          <TextInput
            style={styles.input}
            placeholder="3"
            placeholderTextColor={palette.muted}
            keyboardType="number-pad"
            value={form.sessions_per_week?.toString() ?? ""}
            onChangeText={(text) => setForm((prev) => ({ ...prev, sessions_per_week: text ? Number(text) : null }))}
          />
        </View>
        <View style={styles.formRow}>
          <Text style={styles.label}>Длительность (мин)</Text>
          <TextInput
            style={styles.input}
            placeholder="60"
            placeholderTextColor={palette.muted}
            keyboardType="number-pad"
            value={form.session_duration?.toString() ?? ""}
            onChangeText={(text) => setForm((prev) => ({ ...prev, session_duration: text ? Number(text) : null }))}
          />
        </View>
        <View style={styles.formRow}>
          <Text style={styles.label}>Заметки</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Ограничения, предпочитаемые дни..."
            placeholderTextColor={palette.muted}
            multiline
            value={form.notes ?? ""}
            onChangeText={(text) => setForm((prev) => ({ ...prev, notes: text }))}
          />
        </View>
        <View style={styles.formRow}>
          <Text style={styles.label}>Тема</Text>
          <View style={styles.chipRow}>
            {THEME_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, form.theme === option.value && styles.chipActive]}
                onPress={() => setForm((prev) => ({ ...prev, theme: option.value }))}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, form.theme === option.value && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.formRow}>
          <Text style={styles.label}>Accent color</Text>
          <TextInput
            style={styles.input}
            placeholder="#22d3ee"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            value={form.accent_color ?? ""}
            onChangeText={(text) => setForm((prev) => ({ ...prev, accent_color: text }))}
          />
        </View>
        <TouchableOpacity
          style={[styles.button, (isPrefsSaving || isPrefsLoading) && styles.buttonDisabled]}
          onPress={handleSavePreferences}
          disabled={isPrefsSaving || isPrefsLoading}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>{isPrefsSaving ? "Сохраняем..." : "Сохранить"}</Text>
        </TouchableOpacity>
        {preferences ? <Text style={styles.meta}>Сохраненные значения отображаются выше.</Text> : null}
      </View>
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
      {programsSummary ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Программы</Text>
          <View style={styles.list}>
            {programsSummary.map((program) => (
              <View key={program.name} style={styles.listRow}>
                <Text style={styles.cardText}>{program.name}</Text>
                <Text style={styles.meta}>{program.days} дней</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
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
  meta: {
    ...textStyles.caption,
    color: palette.textSecondary,
  },
  formRow: {
    gap: spacing.xs,
  },
  label: {
    ...textStyles.caption,
    color: palette.muted,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  chipActive: {
    borderColor: palette.accent,
    backgroundColor: "#0d2035",
  },
  chipText: {
    ...textStyles.body,
    fontSize: 14,
    color: palette.textSecondary,
  },
  chipTextActive: {
    color: palette.accent,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.textPrimary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
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
  list: {
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
