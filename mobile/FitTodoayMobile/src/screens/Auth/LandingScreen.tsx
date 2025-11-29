import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors } from '../../theme/colors';
import { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

export function LandingScreen({ navigation }: Props) {
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // В тестах отключаем анимацию
    if (typeof jest !== 'undefined') {
      heroOpacity.setValue(1);
      cardOpacity.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 500,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroOpacity, cardOpacity]);

  return (
    <Screen>
      <StatusBar barStyle="light-content" />
      <View style={styles.full}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.hero, { opacity: heroOpacity }]}>
            <Text style={styles.script}>Привет</Text>
            <Text style={styles.subtitle}>
              Всё, что нужно для тренировки: чеклист дня, таймер отдыха и чистый интерфейс.
              Всё, что тебе так не хватало.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.card, { opacity: cardOpacity }]}>
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
          </Animated.View>
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
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  hero: {
    alignItems: 'center',
    gap: 20,
    marginTop: 60,
    paddingHorizontal: 12,
  },
  script: {
    fontSize: 64,
    fontWeight: '800',
    color: '#b46bff',
    letterSpacing: 1,
    fontFamily: 'Christopher',
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
    width: '100%',
    maxWidth: 420,
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
