'use client';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { machinesApi } from '../../../../features/machines/api/machinesApi';
import { Badge, statusVariant } from '../../../../components/ui/Badge';

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: machine, isLoading } = useQuery({ queryKey: ['machine', id], queryFn: () => machinesApi.getOne(id) });

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  if (!machine) return <div className="p-6 text-sm text-red-500">Machine not found</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{machine.name}</h1>
          <Badge label={machine.status} variant={statusVariant(machine.status)} />
        </div>
        <p className="mt-1 text-sm text-gray-500">Serial: {machine.serialNumber} · {machine.location}</p>
        {machine.lastSeenAt && (
          <p className="mt-0.5 text-xs text-gray-400">Last seen {formatDistanceToNow(new Date(machine.lastSeenAt), { addSuffix: true })}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="font-semibold text-gray-900">Details</h2>
          <dl className="mt-4 space-y-3">
            {[['Model', machine.model ?? 'N/A'], ['Location', machine.location], ['Serial Number', machine.serialNumber]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {(machine as any).statusHistory?.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 font-semibold text-gray-900">Status History</h2>
            <ol className="space-y-3">
              {(machine as any).statusHistory.map((h: any) => (
                <li key={h.id} className="flex items-center gap-3 text-sm">
                  <Badge label={h.status} variant={statusVariant(h.status)} />
                  <span className="text-gray-500 text-xs">{formatDistanceToNow(new Date(h.recordedAt), { addSuffix: true })}</span>
                  {h.reason && <span className="text-gray-400 text-xs">— {h.reason}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
