import { formatDistanceToNow } from 'date-fns';
import type { AlertTimelineEntry } from '../../lib/types';

interface Props { entries: AlertTimelineEntry[] }

const EVENT_ICONS: Record<string, string> = {
  ALERT_CREATED: '🔔',
  ACKNOWLEDGE: '👁',
  START_REPAIR: '🔧',
  ESCALATE: '⬆️',
  RESOLVE: '✅',
  CLOSE: '🔒',
  COMMENT: '💬',
};

export function AlertTimeline({ entries }: Props) {
  return (
    <ol className="space-y-4">
      {entries.map((entry, i) => (
        <li key={entry.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm">
              {EVENT_ICONS[entry.eventType] ?? '•'}
            </span>
            {i < entries.length - 1 && <div className="mt-1 w-px flex-1 bg-gray-200" />}
          </div>
          <div className="min-w-0 flex-1 pb-4">
            <p className="text-sm text-gray-900">{entry.description}</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
