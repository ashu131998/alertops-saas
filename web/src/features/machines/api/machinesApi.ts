import { api } from '../../../lib/api';
import type { Machine } from '../../../lib/types';

export const machinesApi = {
  list: async (params?: Record<string, string | undefined>) => {
    const { data } = await api.get<{ data: Machine[] }>('/machines', { params });
    return data.data;
  },
  getOne: async (id: string) => {
    const { data } = await api.get<{ data: Machine }>(`/machines/${id}`);
    return data.data;
  },
  getStatusSummary: async () => {
    const { data } = await api.get<{ data: Record<string, number> }>('/machines/status-summary');
    return data.data;
  },
  updateStatus: async (id: string, status: string, reason?: string) => {
    const { data } = await api.patch<{ data: Machine }>(`/machines/${id}/status`, { status, reason });
    return data.data;
  },
};
