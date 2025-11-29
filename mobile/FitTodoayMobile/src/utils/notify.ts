import { Alert, ToastAndroid, Platform } from 'react-native';

export function notifyError(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.LONG);
  } else {
    Alert.alert('Ошибка', message);
  }
}

export function notifySuccess(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('Готово', message);
  }
}
