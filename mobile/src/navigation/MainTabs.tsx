import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";

import { AssistantScreen } from "../screens/AssistantScreen";
import { AnalyticsScreen } from "../screens/AnalyticsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { ProgramsScreen } from "../screens/ProgramsScreen";
import { WorkoutScreen } from "../screens/WorkoutScreen";
import { palette } from "../theme";
import { MainTabParamList } from "./types";

const Tab = createBottomTabNavigator<MainTabParamList>();

export const MainTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerStyle: { backgroundColor: palette.card },
      headerShadowVisible: false,
      headerTintColor: palette.textPrimary,
      tabBarStyle: { backgroundColor: palette.card, borderTopColor: palette.border },
      tabBarActiveTintColor: palette.accent,
      tabBarInactiveTintColor: palette.textSecondary,
      tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
    }}
    tabBarLabel: ({ color, children }) => (
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{children}</Text>
    ),
    tabBarIconStyle: { display: "none" },
  >
    <Tab.Screen name="Programs" component={ProgramsScreen} options={{ title: "Программы" }} />
    <Tab.Screen name="Workout" component={WorkoutScreen} options={{ title: "Тренировка" }} />
    <Tab.Screen name="Analytics" component={AnalyticsScreen} options={{ title: "Аналитика" }} />
    <Tab.Screen name="Assistant" component={AssistantScreen} options={{ title: "Ассистент" }} />
    <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Профиль" }} />
  </Tab.Navigator>
);
