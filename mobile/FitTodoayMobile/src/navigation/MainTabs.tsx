import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ProgramsScreen } from '../screens/ProgramsScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { AssistantScreen } from '../screens/AssistantScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Workout"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#f5f7fb',
        tabBarInactiveTintColor: '#8b93a4',
        tabBarStyle: { backgroundColor: '#0f1626' },
      }}>
      <Tab.Screen name="Workout" component={WorkoutScreen} options={{ title: 'Чеклист' }} />
      <Tab.Screen name="Programs" component={ProgramsScreen} options={{ title: 'Программы' }} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Аналитика' }} />
      <Tab.Screen name="Assistant" component={AssistantScreen} options={{ title: 'Ассистент' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Профиль' }} />
    </Tab.Navigator>
  );
}
