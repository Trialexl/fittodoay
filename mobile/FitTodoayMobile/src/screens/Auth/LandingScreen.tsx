import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

export function LandingScreen({ navigation }: Props) {
  return (
    <Screen>
      <StatusBar barStyle="light-content" />
      <View style={styles.full}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.script}>Привет</Text>
            <Text style={styles.subtitle}>
              Всё, что нужно для тренировки: чеклист дня, таймер отдыха и чистый интерфейс.
              Всё, что тебе так не хватало.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.brandTop}>F I T</Text>
            <Text style={styles.brandMid}>TOD◉AY</Text>
            <View style={styles.inputs}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputMock}>
                <Text style={styles.inputText}>you@example.com</Text>
              </View>
              <Text style={styles.label}>Пароль</Text>
              <View style={styles.inputMock}>
                <Text style={styles.inputText}>••••••••</Text>
              </View>
              <PrimaryButton
                title="Начать тренировку"
                onPress={() => navigation.navigate('AuthScreen')}
              />
              <Text style={styles.helper}>Введите email и пароль</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  full: {
    flex: 1,
    backgroundColor: '#0c0f1a',
  },
  container: {
    flex: 1,
    paddingBottom: 32,
    gap: 24,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    gap: 20,
    marginTop: 40,
  },
  script: {
    fontSize: 64,
    fontWeight: '800',
    color: '#b46bff',
    letterSpacing: 1,
    fontFamily: 'Inter-Bold',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#eef1ff',
    fontFamily: 'Inter-Bold',
  },
  subtitle: {
    fontSize: 16,
    color: '#9aa3c7',
    textAlign: 'center',
    paddingHorizontal: 12,
    fontFamily: 'Inter-Regular',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1d2238',
    backgroundColor: '#0e1222',
    padding: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },
  brandTop: {
    textAlign: 'center',
    color: '#9aa3c7',
    letterSpacing: 6,
    fontSize: 12,
    marginTop: 6,
    fontFamily: 'Inter-Regular',
  },
  brandMid: {
    textAlign: 'center',
    color: '#b46bff',
    fontSize: 14,
    letterSpacing: 3,
    marginBottom: 12,
    fontFamily: 'Inter-SemiBold',
  },
  inputs: {
    gap: 10,
  },
  label: {
    color: '#cfd4e8',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  inputMock: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#2b3043',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  inputText: {
    color: '#d8dbea',
    fontFamily: 'Inter-Regular',
  },
  helper: {
    color: '#7680a0',
    textAlign: 'center',
    marginTop: 4,
    fontFamily: 'Inter-Regular',
  },
});
