import { API_URL } from '@env';

const normalizedApiUrl =
  typeof API_URL === 'string' && API_URL.length > 0
    ? API_URL.replace(/\/+$/, '')
    : '';

if (__DEV__ && !normalizedApiUrl) {
  // eslint-disable-next-line no-console
  console.warn('API_URL is not defined. Set it in .env');
}

export const config = {
  apiUrl: normalizedApiUrl,
};
