import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface UserProfile {
  id: string;
  email?: string;
  name?: string;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  hydrated: boolean;
  setSession: (token: string, user?: UserProfile | null) => void;
  clearSession: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hydrated: false,
      setSession: (token, user = null) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
      setHydrated: hydrated => set({ hydrated }),
    }),
    {
      name: 'fitTODOay/auth',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => state => {
        state?.setHydrated(true);
      },
    },
  ),
);
