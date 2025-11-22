import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>fitTODOay Mobile (Android focus)</Text>
      <Text style={styles.subtitle}>
        Expo project scaffold готов. Запустите `npm install` и `npm run android`, чтобы открыть приложение в эмуляторе или на устройстве.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#f8fafc",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: "#cbd5f5",
    textAlign: "center",
    lineHeight: 22,
  },
});
