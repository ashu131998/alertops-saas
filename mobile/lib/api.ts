import axios from 'axios';
import Constants from 'expo-constants';
import { secureStorage } from './secureStorage';

const API_URL = (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:4000/api/v1';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use(async (config) => {
  const token = await secureStorage.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await secureStorage.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        await secureStorage.setTokens(data.data.accessToken, data.data.refreshToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        await secureStorage.clear();
        // Navigation to login will happen via auth store listener
      }
    }
    return Promise.reject(err);
  },
);
