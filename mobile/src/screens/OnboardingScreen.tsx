import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { RootStackParamList } from "../navigation/types";
import { palette, radius, spacing, textStyles } from "../theme";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export const OnboardingScreen = ({ navigation }: Props) => {
  const handleContinue = () => {
    navigation.replace("Main");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <Text style={styles.title}>fitTODOay Mobile</Text>
        <Text style={styles.subtitle}>
          Соберём ваш профиль и подготовим программу тренировок. UX и брендинг совпадают с вебом,
          но навигация и жесты нативные.
        </Text>
        <View style={styles.steps}>
          <Text style={styles.step}>• Авторизация и онбординг с предпочтениями</Text>
          <Text style={styles.step}>• Program Board с drag&drop и модалками</Text>
          <Text style={styles.step}>• Чеклист, офлайн-очередь и таймеры</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.button} onPress={handleContinue} activeOpacity={0.9}>
        <Text style={styles.buttonText}>Перейти к приложению</Text>
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
  steps: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  step: {
    ...textStyles.body,
    color: palette.textSecondary,
  },
  button: {
    marginTop: "auto",
    backgroundColor: palette.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  buttonText: {
    ...textStyles.heading,
    color: palette.background,
    fontSize: 18,
  },
});
