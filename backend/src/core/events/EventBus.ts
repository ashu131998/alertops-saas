import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../config/logger';
import { DomainEvent, EventHandler, EventType } from './types';

type HandlerMap = Map<EventType, EventHandler[]>;

export class EventBus {
  private readonly handlers: HandlerMap = new Map();
  private static instance: EventBus;

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  subscribe<T extends DomainEvent>(eventType: EventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler as EventHandler);
    logger.debug({ eventType }, 'EventBus: handler subscribed');

    return () => {
      const list = this.handlers.get(eventType) ?? [];
      const idx = list.indexOf(handler as EventHandler);
      if (idx !== -1) list.splice(idx, 1);
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];
    if (handlers.length === 0) {
      logger.debug({ eventType: event.eventType }, 'EventBus: no handlers registered');
      return;
    }

    logger.info({ eventId: event.eventId, eventType: event.eventType, factoryId: event.factoryId }, 'EventBus: publishing event');

    await Promise.allSettled(
      handlers.map((handler) =>
        handler(event).catch((err) =>
          logger.error({ err, eventId: event.eventId, eventType: event.eventType }, 'EventBus: handler error'),
        ),
      ),
    );
  }

  createEvent<T extends Omit<DomainEvent, 'eventId' | 'timestamp' | 'version'>>(partial: T): T & { eventId: string; timestamp: string; version: number } {
    return {
      ...partial,
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      version: 1,
    };
  }
}

export const eventBus = EventBus.getInstance();
