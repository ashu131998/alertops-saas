import { create } from 'zustand';
import { secureStorage } from '../../lib/secureStorage';
import type { User } from '../../lib/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: async (user, accessToken, refreshToken) => {
    await secureStorage.setTokens(accessToken, refreshToken);
    await secureStorage.setUser(user);
    set({ user, isAuthenticated: true, isLoading: false });
  },

  clearAuth: async () => {
    await secureStorage.clear();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  hydrateFromStorage: async () => {
    try {
      const [token, user] = await Promise.all([
        secureStorage.getAccessToken(),
        secureStorage.getUser<User>(),
      ]);
      if (token && user) {
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
