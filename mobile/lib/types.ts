export type Role = 'ADMIN' | 'SUPERVISOR' | 'WORKER';
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type MachineStatus = 'ONLINE' | 'OFFLINE' | 'WARNING' | 'CRITICAL' | 'MAINTENANCE';
export type ActionType = 'ACKNOWLEDGE' | 'START_REPAIR' | 'ESCALATE' | 'RESOLVE' | 'CLOSE' | 'COMMENT';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  factoryId: string;
  factory: { id: string; name: string };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AlertSummary {
  id: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  isRead: boolean;
  machineId: string;
  machineName: string;
  factoryId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertReplyOption {
  id: string;
  label: string;
  description?: string;
}

export interface AlertReplyMetadata {
  kind?: 'downtime_reason' | 'config_selection';
  prompt?: string;
  options?: AlertReplyOption[];
  [key: string]: unknown;
}

export interface AlertDetail extends AlertSummary {
  description: string;
  machine: { id: string; name: string; location: string } | null;
  externalMachineName?: string | null;
  factory: { id: string; name: string };
  timeline: AlertTimelineEntry[];
  actions: AlertActionRecord[];
  availableActions: AvailableAction[];
  metadata?: AlertReplyMetadata | null;
}

export interface AlertTimelineEntry {
  id: string;
  eventType: string;
  description: string;
  createdAt: string;
}

export interface AlertActionRecord {
  id: string;
  actionType: ActionType;
  comment?: string;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; role: Role };
}

export interface AvailableAction {
  actionType: ActionType;
  label: string;
  description: string;
  requiresComment: boolean;
  confirmationRequired: boolean;
}

export interface AlertListResponse {
  data: AlertSummary[];
  meta: { total: number; page: number; limit: number; hasMore: boolean };
}

export interface DashboardStats {
  unreadCount: number;
  criticalCount: number;
  openCount: number;
  acknowledgedCount: number;
  inProgressCount: number;
  resolvedCount: number;
}
