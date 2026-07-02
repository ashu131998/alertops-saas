import Link from 'next/link';
import clsx from 'clsx';
import { Badge, statusVariant } from '../ui/Badge';
import type { Machine } from '../../lib/types';

const STATUS_DOT: Record<string, string> = {
  ONLINE: 'bg-green-500',
  OFFLINE: 'bg-gray-400',
  WARNING: 'bg-yellow-500',
  CRITICAL: 'bg-red-500',
  MAINTENANCE: 'bg-blue-500',
};

interface Props { machine: Machine }

export function MachineCard({ machine }: Props) {
  return (
    <Link href={`/dashboard/machines/${machine.id}`}
      className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
    >
      <span className={clsx('h-3 w-3 rounded-full', STATUS_DOT[machine.status] ?? 'bg-gray-400')} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900">{machine.name}</p>
        <p className="text-xs text-gray-500">{machine.location} · SN: {machine.serialNumber}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge label={machine.status} variant={statusVariant(machine.status)} />
        {(machine._count?.alerts ?? 0) > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {machine._count!.alerts} alerts
          </span>
        )}
      </div>
    </Link>
  );
}
