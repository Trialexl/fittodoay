import { Alert } from 'react-native';

export function notifyError(message: string) {
  Alert.alert('Ошибка', message);
}
