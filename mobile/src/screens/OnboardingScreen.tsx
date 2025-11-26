import { useState } from "react";

import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { authApi } from "../api/auth";
import { useAuth } from "../hooks/useAuth";
import { RootStackParamList } from "../navigation/types";
import { palette, radius, spacing, textStyles } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export const OnboardingScreen = ({ navigation }: Props) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const response = mode === "login"
        ? await authApi.login({ email, password })
        : await authApi.register({ email, password });
      await signIn(response.token);
      navigation.replace("Main");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти");
    } finally {
      setIsLoading(false);
    }
  };

  const isDisabled = isLoading || !email || !password;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <Text style={styles.title}>fitTODOay Mobile</Text>
        <Text style={styles.subtitle}>
          Соберём ваш профиль и подготовим программу тренировок. UX и брендинг совпадают с вебом,
          но навигация и жесты нативные.
        </Text>
        <View style={styles.inputBlock}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={palette.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.inputBlock}>
          <Text style={styles.label}>Пароль</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={palette.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.toggleRow}>
          <Text style={styles.label}>Режим: </Text>
          <TouchableOpacity
            style={[styles.chip, mode === "login" && styles.chipActive]}
            onPress={() => setMode("login")}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, mode === "login" && styles.chipTextActive]}>Вход</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, mode === "register" && styles.chipActive]}
            onPress={() => setMode("register")}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, mode === "register" && styles.chipTextActive]}>Регистрация</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.steps}>
          <Text style={styles.step}>• Авторизация и онбординг с предпочтениями</Text>
          <Text style={styles.step}>• Program Board с drag&drop и модалками</Text>
          <Text style={styles.step}>• Чеклист, офлайн-очередь и таймеры</Text>
        </View>
      </View>
      <TouchableOpacity style={[styles.button, isDisabled && styles.buttonDisabled]} onPress={handleContinue} activeOpacity={0.9} disabled={isDisabled}>
        {isLoading ? (
          <ActivityIndicator color={palette.background} />
        ) : (
          <Text style={styles.buttonText}>{mode === "login" ? "Войти и продолжить" : "Зарегистрироваться"}</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  content: {
    gap: spacing.md,
  },
  title: {
    ...textStyles.heading,
    fontSize: 26,
  },
  subtitle: {
    ...textStyles.body,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  steps: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  step: {
    ...textStyles.body,
    color: palette.textSecondary,
  },
  inputBlock: {
    gap: spacing.xs,
  },
  label: {
    ...textStyles.caption,
    color: palette.muted,
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
  error: {
    ...textStyles.body,
    color: "#f87171",
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
  button: {
    marginTop: "auto",
    backgroundColor: palette.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...textStyles.heading,
    color: palette.background,
    fontSize: 18,
  },
});
