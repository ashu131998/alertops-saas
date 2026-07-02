'use client';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { Badge, severityVariant, statusVariant } from '../ui/Badge';
import type { AlertSummary } from '../../lib/types';

interface Props {
  alert: AlertSummary;
}

export function AlertCard({ alert }: Props) {
  return (
    <Link
      href={`/dashboard/alerts/${alert.id}`}
      className={clsx(
        'flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-gray-50',
        !alert.isRead ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white',
      )}
    >
      {!alert.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
      {alert.isRead && <span className="mt-1.5 h-2 w-2 shrink-0" />}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={alert.severity} variant={severityVariant(alert.severity)} />
          <Badge label={alert.status.replace('_', ' ')} variant={statusVariant(alert.status)} />
        </div>
        <p className={clsx('mt-1 text-sm text-gray-900', !alert.isRead && 'font-semibold')}>{alert.title}</p>
        <p className="mt-0.5 text-xs text-gray-500">
          {alert.machineName} · {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
        </p>
      </div>
    </Link>
  );
}
