import { api } from '../../../lib/api';
import type { AlertListResponse, AlertDetail, DashboardStats } from '../../../lib/types';

export const alertsApi = {
  list: async (params: Record<string, string | number | boolean | undefined>) => {
    const { data } = await api.get<AlertListResponse>('/alerts', { params });
    return data;
  },
  getOne: async (id: string) => {
    const { data } = await api.get<{ data: AlertDetail }>(`/alerts/${id}`);
    return data.data;
  },
  takeAction: async (id: string, actionType: string, comment?: string) => {
    const { data } = await api.post<{ data: AlertDetail }>(`/alerts/${id}/actions`, { actionType, comment });
    return data.data;
  },
  respond: async (id: string, optionId: string) => {
    const { data } = await api.post<{
      data: { ok: boolean; message?: string; error?: string; alert: AlertDetail };
    }>(`/alerts/${id}/respond`, { optionId });
    return data.data;
  },
  getDashboardStats: async () => {
    const { data } = await api.get<{ data: DashboardStats }>('/alerts/stats');
    return data.data;
  },
  markAllRead: async () => {
    await api.patch('/alerts/read-all');
  },
};
