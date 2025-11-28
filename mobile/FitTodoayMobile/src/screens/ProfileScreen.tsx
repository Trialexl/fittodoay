import React from 'react';
import { Button } from 'react-native';
import { Screen } from '../components/Screen';
import { Placeholder } from '../components/Placeholder';
import { useAuthStore } from '../state/auth';

export function ProfileScreen() {
  const clearSession = useAuthStore(state => state.clearSession);

  return (
    <Screen>
      <Placeholder
        title="Профиль"
        description="Просмотр профиля и предпочтений ассистента. Здесь будет выход из аккаунта."
      />
      <Button title="Выйти" onPress={clearSession} />
    </Screen>
  );
}
