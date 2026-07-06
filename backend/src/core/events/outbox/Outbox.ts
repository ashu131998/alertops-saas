import { Prisma } from '@prisma/client';
import { logger } from '../../../config/logger';
import { eventBus } from '../EventBus';
import { DomainEvent } from '../types';
import type { OutboxWorker } from './OutboxWorker';

type TxClient = Prisma.TransactionClient;

/**
 * The transactional outbox — the durable half of the "never-miss" promise.
 *
 * `enqueue` persists a domain event to `event_store` inside the SAME database
 * transaction as the state change that produced it. Either both commit or
 * neither does, so a crash between "alert written" and "worker notified" can no
 * longer drop the notification: the event is already on disk and the worker
 * will pick it up.
 *
 * `dispatchInstant` is the best-effort, low-latency half. It is called AFTER the
 * enqueueing transaction commits and fires the in-process live-view handlers
 * (WebSocket) plus nudges the worker so durable side effects (push, etc.) run
 * immediately instead of waiting for the next poll. Nothing here is relied on
 * for correctness — if the process dies before it runs, the worker still drains
 * the persisted event on restart.
 */
class Outbox {
  private worker: OutboxWorker | null = null;

  registerWorker(worker: OutboxWorker): void {
    this.worker = worker;
  }

  /** Append an event to the outbox within the caller's transaction. */
  async enqueue(event: DomainEvent, tx: TxClient): Promise<void> {
    await tx.eventStore.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        factoryId: event.factoryId,
        machineId: event.machineId ?? null,
        alertId: event.alertId ?? null,
        payload: (((event as { payload?: unknown }).payload ?? {}) as Prisma.InputJsonValue),
        version: event.version,
      },
    });
  }

  /**
   * Call AFTER the enqueueing transaction has committed. Fires instant in-process
   * handlers (WebSocket live view) and wakes the worker. Never throws — instant
   * delivery is best-effort by design.
   */
  dispatchInstant(event: DomainEvent): void {
    eventBus
      .publish(event)
      .catch((err) => logger.error({ err, eventId: event.eventId }, 'Outbox: instant dispatch failed'));
    this.worker?.wake();
  }
}

export const outbox = new Outbox();
