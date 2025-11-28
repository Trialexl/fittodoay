import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { enableScreens } from 'react-native-screens';
import { AppNavigator } from './navigation/AppNavigator';
import { queryClient } from './api/queryClient';
import { useOfflineQueueSync } from './state/offlineQueue';

enableScreens();

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
