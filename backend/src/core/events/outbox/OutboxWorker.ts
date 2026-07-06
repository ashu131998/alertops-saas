import { PrismaClient, EventStore } from '@prisma/client';
import { logger } from '../../../config/logger';
import { DomainEvent, EventType } from '../types';
import { OutboxDispatcher } from './OutboxDispatcher';

export interface OutboxWorkerConfig {
  pollIntervalMs: number;
  batchSize: number;
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

/**
 * Drains the transactional outbox (`event_store`): claims unprocessed events in
 * sequence order, runs their durable handlers, and marks them processed. Failed
 * events are retried with exponential backoff and dead-lettered after
 * `maxAttempts`, so a transient push/DB blip is recovered instead of silently
 * lost.
 *
 * Assumes a single API instance owns delivery (the current deployment). The
 * in-flight `running` guard serialises ticks within the process; for a
 * multi-instance rollout the claim query would need `FOR UPDATE SKIP LOCKED`.
 */
export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false; // a tick is in flight
  private stopped = true;
  private wakeRequested = false;

  constructor(
    private readonly db: PrismaClient,
    private readonly dispatcher: OutboxDispatcher,
    private readonly cfg: OutboxWorkerConfig,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.scheduleNext(0);
    logger.info({ pollIntervalMs: this.cfg.pollIntervalMs, batchSize: this.cfg.batchSize }, 'Outbox worker started');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Let an in-flight tick finish so we don't cut a delivery mid-flight.
    while (this.running) {
      await new Promise((r) => setTimeout(r, 25));
    }
    logger.info('Outbox worker stopped');
  }

  /** Nudge the worker to process immediately (e.g. right after an enqueue). */
  wake(): void {
    if (this.stopped) return;
    if (this.running) {
      this.wakeRequested = true;
      return;
    }
    this.scheduleNext(0);
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
    // The HTTP server keeps the process alive; don't let the poll timer alone
    // hold the event loop open (also avoids dangling-timer leaks in tests).
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    let processedAny = false;
    try {
      const batch = await this.claimBatch();
      processedAny = batch.length > 0;
      for (const row of batch) {
        if (this.stopped) break;
        await this.process(row);
      }
    } catch (err) {
      logger.error({ err }, 'Outbox worker tick failed');
    } finally {
      this.running = false;
      // If we drained a full-ish batch or someone woke us mid-tick, loop again
      // immediately to keep draining; otherwise fall back to the idle poll.
      const drainNow = processedAny || this.wakeRequested;
      this.wakeRequested = false;
      this.scheduleNext(drainNow ? 0 : this.cfg.pollIntervalMs);
    }
  }

  private claimBatch(): Promise<EventStore[]> {
    return this.db.eventStore.findMany({
      where: { processedAt: null, failedAt: null, nextAttemptAt: { lte: new Date() } },
      orderBy: { sequence: 'asc' },
      take: this.cfg.batchSize,
    });
  }

  private async process(row: EventStore): Promise<void> {
    const attempts = row.attempts + 1;
    try {
      await this.dispatcher.dispatch(this.rowToEvent(row));
      await this.db.eventStore.update({
        where: { id: row.id },
        data: { processedAt: new Date(), attempts, lastError: null },
      });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
      if (attempts >= this.cfg.maxAttempts) {
        await this.db.eventStore.update({
          where: { id: row.id },
          data: { attempts, failedAt: new Date(), lastError: message },
        });
        logger.error(
          { eventId: row.eventId, eventType: row.eventType, attempts, err },
          'Outbox event dead-lettered after max attempts',
        );
      } else {
        const delay = Math.min(this.cfg.baseBackoffMs * 2 ** (attempts - 1), this.cfg.maxBackoffMs);
        await this.db.eventStore.update({
          where: { id: row.id },
          data: { attempts, nextAttemptAt: new Date(Date.now() + delay), lastError: message },
        });
        logger.warn({ eventId: row.eventId, attempts, retryInMs: delay }, 'Outbox event retry scheduled');
      }
    }
  }

  private rowToEvent(row: EventStore): DomainEvent {
    return {
      eventId: row.eventId,
      eventType: row.eventType as EventType,
      timestamp: row.createdAt.toISOString(),
      version: row.version,
      factoryId: row.factoryId ?? '',
      machineId: row.machineId ?? undefined,
      alertId: row.alertId ?? undefined,
      payload: row.payload,
    } as unknown as DomainEvent;
  }
}
