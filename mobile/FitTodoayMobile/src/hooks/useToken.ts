import { useAuthStore } from '../state/auth';

export function useToken() {
  return useAuthStore(state => state.token);
}
