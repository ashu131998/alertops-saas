'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { SummaryCards } from '../../components/dashboard/SummaryCards';
import { AlertCard } from '../../components/alerts/AlertCard';
import { MachineCard } from '../../components/machines/MachineCard';
import { alertsApi } from '../../features/alerts/api/alertsApi';
import { machinesApi } from '../../features/machines/api/machinesApi';

export default function DashboardPage() {
  const { data: alerts } = useQuery({
    queryKey: ['alerts', 'recent'],
    queryFn: () => alertsApi.list({ limit: 5, status: 'OPEN' }),
    refetchInterval: 30_000,
  });

  const { data: machines } = useQuery({
    queryKey: ['machines', 'critical'],
    queryFn: () => machinesApi.list({ status: 'CRITICAL' }),
    refetchInterval: 30_000,
  });

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Real-time factory monitoring overview</p>
      </div>

      <SummaryCards />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Open Alerts</h2>
            <Link href="/dashboard/alerts" className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {alerts?.data.length === 0 && <p className="text-sm text-gray-500">No open alerts</p>}
            {alerts?.data.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Critical Machines</h2>
            <Link href="/dashboard/machines" className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {machines?.length === 0 && <p className="text-sm text-gray-500">No critical machines</p>}
            {machines?.map((m) => <MachineCard key={m.id} machine={m} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
