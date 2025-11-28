import React from 'react';
import { Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Placeholder } from '../../components/Placeholder';
import { AuthStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../state/auth';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const setSession = useAuthStore(state => state.setSession);

  const handleLogin = () => {
    // TODO: заменить на реальный запрос к API
    setSession('dev-token');
  };

  return (
    <Screen>
      <Placeholder
        title="Вход"
        description="Экран входа подключится к API `/api/auth/login/`."
      />
      <Button title="Войти (заглушка)" onPress={handleLogin} />
      <Button title="Назад" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
