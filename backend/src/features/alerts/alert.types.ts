import { AlertSeverity, AlertStatus, ActionType } from '@prisma/client';

export interface CreateAlertDto {
  title: string;
  description: string;
  severity: AlertSeverity;
  machineId: string;
  factoryId: string;
  metadata?: Record<string, unknown>;
}

export interface ListAlertsQuery {
  page?: number;
  limit?: number;
  status?: AlertStatus;
  severity?: AlertSeverity;
  machineId?: string;
  search?: string;
  cursor?: string;
  unreadOnly?: boolean;
}

export interface TakeActionDto {
  actionType: ActionType;
  comment?: string;
}

export interface AlertListResponse {
  data: AlertSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
    nextCursor?: string;
  };
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

export interface AvailableAction {
  actionType: ActionType;
  label: string;
  description: string;
  requiresComment: boolean;
  confirmationRequired: boolean;
}
