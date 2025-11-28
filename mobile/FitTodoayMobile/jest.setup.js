import 'react-native-gesture-handler/jestSetup';
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native/src/private/animated/NativeAnimatedHelper');
jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-community/netinfo', () => {
  return {
    addEventListener: jest.fn().mockReturnValue(() => {}),
    fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
  };
});
