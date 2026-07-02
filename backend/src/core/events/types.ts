export enum EventType {
  ALERT_CREATED = 'ALERT_CREATED',
  ALERT_UPDATED = 'ALERT_UPDATED',
  ALERT_ACKNOWLEDGED = 'ALERT_ACKNOWLEDGED',
  ALERT_RESOLVED = 'ALERT_RESOLVED',
  ALERT_CLOSED = 'ALERT_CLOSED',
  MACHINE_ONLINE = 'MACHINE_ONLINE',
  MACHINE_OFFLINE = 'MACHINE_OFFLINE',
  MACHINE_STATUS_CHANGED = 'MACHINE_STATUS_CHANGED',
  USER_LOGGED_IN = 'USER_LOGGED_IN',
  USER_LOGGED_OUT = 'USER_LOGGED_OUT',
}

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  timestamp: string;
  version: number;
  factoryId: string;
  machineId?: string;
  alertId?: string;
  userId?: string;
}

export interface AlertCreatedEvent extends BaseEvent {
  eventType: EventType.ALERT_CREATED;
  payload: {
    alertId: string;
    title: string;
    description: string;
    severity: string;
    status: string;
    machineId: string;
    machineName: string;
    factoryId: string;
  };
}

export interface AlertUpdatedEvent extends BaseEvent {
  eventType: EventType.ALERT_UPDATED;
  payload: {
    alertId: string;
    previousStatus: string;
    newStatus: string;
    actionType: string;
    updatedBy: string;
    comment?: string;
  };
}

export interface MachineStatusChangedEvent extends BaseEvent {
  eventType: EventType.MACHINE_STATUS_CHANGED;
  payload: {
    machineId: string;
    machineName: string;
    previousStatus: string;
    newStatus: string;
    reason?: string;
  };
}

export type DomainEvent = AlertCreatedEvent | AlertUpdatedEvent | MachineStatusChangedEvent | BaseEvent;

export type EventHandler<T extends DomainEvent = DomainEvent> = (event: T) => Promise<void>;
