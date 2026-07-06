import { logger } from '../../../config/logger';
import { DomainEvent, EventHandler, EventType } from '../types';

/**
 * Registry for *durable* event handlers — the ones the outbox worker runs off
 * the persisted event log. Unlike the in-process EventBus (best-effort, instant,
 * swallows errors so the request path never blocks on a side effect), a failure
 * here is propagated so the worker can retry the event with backoff.
 *
 * Because delivery is at-least-once, every handler registered here MUST be
 * idempotent: re-running it for the same event may not double-notify, double
 * -create, etc. (The push handler dedupes via delivery receipts; the downtime
 * handler dedupes on an already-open alert.)
 */
export class OutboxDispatcher {
  private readonly handlers = new Map<EventType, EventHandler[]>();

  subscribe<T extends DomainEvent>(eventType: EventType, handler: EventHandler<T>): void {
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler as EventHandler);
    this.handlers.set(eventType, list);
    logger.debug({ eventType }, 'OutboxDispatcher: durable handler registered');
  }

  hasHandlers(eventType: EventType): boolean {
    return (this.handlers.get(eventType)?.length ?? 0) > 0;
  }

  /**
   * Runs every durable handler for the event. All handlers are attempted (a
   * slow/failing one doesn't starve the others); if any reject, an AggregateError
   * is thrown so the worker retries the whole event. Idempotent handlers make the
   * repeat safe.
   */
  async dispatch(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) ?? [];
    if (handlers.length === 0) return;

    const results = await Promise.allSettled(handlers.map((handler) => handler(event)));
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
      for (const f of failures) {
        logger.error(
          { err: f.reason, eventId: event.eventId, eventType: event.eventType },
          'OutboxDispatcher: durable handler failed',
        );
      }
      throw new AggregateError(
        failures.map((f) => f.reason),
        `${failures.length} durable handler(s) failed for ${event.eventType}`,
      );
    }
  }
}

export const outboxDispatcher = new OutboxDispatcher();
