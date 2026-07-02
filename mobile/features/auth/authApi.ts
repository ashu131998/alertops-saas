import { api } from '../../lib/api';
import type { User, TokenPair } from '../../lib/types';

export const authApi = {
  login: async (email: string, password: string): Promise<{ user: User; tokens: TokenPair }> => {
    const { data } = await api.post<{ data: { user: User; tokens: TokenPair } }>('/auth/login', { email, password });
    return data.data;
  },
  logout: async (refreshToken: string) => {
    await api.post('/auth/logout', { refreshToken });
  },
  getMe: async (): Promise<User> => {
    const { data } = await api.get<{ data: User }>('/auth/me');
    return data.data;
  },
};
