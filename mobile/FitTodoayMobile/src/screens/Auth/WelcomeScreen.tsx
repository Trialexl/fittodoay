import React from 'react';
import { Button } from 'react-native';
import { Screen } from '../../components/Screen';
import { Placeholder } from '../../components/Placeholder';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <Screen>
      <Placeholder
        title="fitTODOay"
        description="Добро пожаловать! Войдите или создайте профиль, чтобы продолжить."
      />
      <Button title="Войти" onPress={() => navigation.navigate('Login')} />
      <Button title="Онбординг" onPress={() => navigation.navigate('Onboarding')} />
    </Screen>
  );
}
