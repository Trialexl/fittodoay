import React from 'react';
import { StatusBar, useColorScheme, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { enableScreens } from 'react-native-screens';
import { AppNavigator } from './navigation/AppNavigator';
import { queryClient } from './api/queryClient';
import { useOfflineQueueSync } from './state/offlineQueue';

enableScreens();

// Применяем Inter по умолчанию
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.style = [
  Text.defaultProps.style,
  { fontFamily: 'Inter-Regular' },
];
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [
  TextInput.defaultProps.style,
  { fontFamily: 'Inter-Regular' },
];

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  useOfflineQueueSync();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <AppNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
