import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { RootStackParamList } from './types';
import { useAuthStore } from '../state/auth';
import { useThemedColors } from '../theme/colors';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const colors = useThemedColors();
  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: colors.background,
        primary: colors.primary,
        text: colors.text,
        card: colors.surface,
        border: colors.border,
      },
    }),
    [colors],
  );
  const token = useAuthStore(state => state.token);
  const hydrated = useAuthStore(state => state.hydrated);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b0f1a' }}>
        <ActivityIndicator size="large" color="#f2b200" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthStack} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
