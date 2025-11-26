import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette, spacing, textStyles } from "../theme";

type PlaceholderScreenProps = {
  title: string;
  description?: string;
  actionSlot?: ReactNode;
};

export const PlaceholderScreen = ({ title, description, actionSlot }: PlaceholderScreenProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    {description ? <Text style={styles.description}>{description}</Text> : null}
    {actionSlot}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...textStyles.heading,
  },
  description: {
    ...textStyles.body,
  },
});
