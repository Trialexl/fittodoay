import React from 'react';
import { Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Placeholder } from '../../components/Placeholder';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboarding'>;

export function OnboardingScreen({ navigation }: Props) {
  return (
    <Screen>
      <Placeholder
        title="Онбординг"
        description="Мульти-шаговый визард профиля и предпочтений ассистента."
      />
      <Button title="Продолжить к входу" onPress={() => navigation.navigate('Login')} />
      <Button title="Назад" onPress={() => navigation.goBack()} />
    </Screen>
  );
}
