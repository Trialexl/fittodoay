import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LandingScreen } from '../screens/Auth/LandingScreen';
import { OnboardingScreen } from '../screens/Auth/OnboardingScreen';
import { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}
