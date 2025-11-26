import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAuth } from "../hooks/useAuth";
import { PlaceholderScreen } from "../components/PlaceholderScreen";
import { palette, radius, spacing, textStyles } from "../theme";

export const ProfileScreen = () => (
  <PlaceholderScreen
    title="Профиль"
    description="Здесь будут настройки аккаунта, тема, токены и сохранённые предпочтения LLM. Свяжем с SecureStore для хранения сессии."
    actionSlot={<ProfileActions />}
  />
);

const ProfileActions = () => {
  const { token, user, signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Сессия</Text>
      <Text style={styles.cardText}>{token ? `Token: ${token}` : "Не авторизован"}</Text>
      {user ? (
        <View style={styles.userBlock}>
          <Text style={styles.userLine}>Email: {user.email}</Text>
          {user.first_name || user.last_name ? (
            <Text style={styles.userLine}>
              Имя: {[user.first_name, user.last_name].filter(Boolean).join(" ")}
            </Text>
          ) : null}
        </View>
      ) : null}
      {token ? (
        <TouchableOpacity onPress={handleLogout} style={styles.button} activeOpacity={0.9}>
          <Text style={styles.buttonText}>Выйти</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
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
  userBlock: {
    gap: spacing.xs,
  },
  userLine: {
    ...textStyles.body,
    color: palette.textSecondary,
  },
  button: {
    backgroundColor: palette.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignSelf: "flex-start",
  },
  buttonText: {
    ...textStyles.heading,
    fontSize: 16,
    color: palette.background,
  },
});
