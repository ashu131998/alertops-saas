import clsx from 'clsx';

type Variant = 'critical' | 'high' | 'medium' | 'low' | 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed' | 'online' | 'offline' | 'warning' | 'maintenance' | 'default';

const VARIANT_CLASSES: Record<Variant, string> = {
  critical: 'bg-red-100 text-red-800 ring-red-600/20',
  high: 'bg-orange-100 text-orange-800 ring-orange-500/20',
  medium: 'bg-yellow-100 text-yellow-800 ring-yellow-500/20',
  low: 'bg-blue-100 text-blue-800 ring-blue-500/20',
  open: 'bg-red-100 text-red-700 ring-red-600/20',
  acknowledged: 'bg-yellow-100 text-yellow-700 ring-yellow-500/20',
  in_progress: 'bg-purple-100 text-purple-700 ring-purple-500/20',
  resolved: 'bg-green-100 text-green-700 ring-green-600/20',
  closed: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  online: 'bg-green-100 text-green-700 ring-green-600/20',
  offline: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  warning: 'bg-yellow-100 text-yellow-700 ring-yellow-500/20',
  maintenance: 'bg-blue-100 text-blue-700 ring-blue-500/20',
  default: 'bg-gray-100 text-gray-700 ring-gray-500/20',
};

interface BadgeProps {
  label: string;
  variant?: Variant;
  className?: string;
}

export function Badge({ label, variant = 'default', className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', VARIANT_CLASSES[variant], className)}>
      {label}
    </span>
  );
}

export function severityVariant(s: string): Variant {
  return s.toLowerCase() as Variant;
}

export function statusVariant(s: string): Variant {
  return s.toLowerCase().replace('_', '_') as Variant;
}
