'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

export default function FactoriesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['factories'],
    queryFn: async () => {
      const { data } = await api.get<{ data: any[] }>('/factories');
      return data.data;
    },
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Factories</h1>
      {isLoading && <p className="mt-4 text-sm text-gray-500">Loading...</p>}
      <div className="mt-6 space-y-3">
        {data?.map((f: any) => (
          <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏭</span>
              <div>
                <p className="font-semibold text-gray-900">{f.name}</p>
                <p className="text-sm text-gray-500">{f.location} · {f.timezone}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
