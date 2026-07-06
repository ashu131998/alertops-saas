import { OutboxWorker, OutboxWorkerConfig } from '../OutboxWorker';
import { OutboxDispatcher } from '../OutboxDispatcher';
import { EventType } from '../../types';

jest.mock('../../../../config/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type Row = {
  id: string;
  sequence: bigint;
  eventId: string;
  eventType: string;
  factoryId: string | null;
  machineId: string | null;
  alertId: string | null;
  payload: unknown;
  version: number;
  attempts: number;
  nextAttemptAt: Date;
  processedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
};

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: overrides.id ?? 'row-1',
    sequence: overrides.sequence ?? 1n,
    eventId: overrides.eventId ?? 'evt-1',
    eventType: overrides.eventType ?? EventType.ALERT_CREATED,
    factoryId: overrides.factoryId ?? 'f1',
    machineId: overrides.machineId ?? null,
    alertId: overrides.alertId ?? 'a1',
    payload: overrides.payload ?? { alertId: 'a1' },
    version: overrides.version ?? 1,
    attempts: overrides.attempts ?? 0,
    nextAttemptAt: overrides.nextAttemptAt ?? new Date(Date.now() - 1000),
    processedAt: overrides.processedAt ?? null,
    failedAt: overrides.failedAt ?? null,
    lastError: overrides.lastError ?? null,
    createdAt: overrides.createdAt ?? new Date(),
  };
}

function makeFakeDb(rows: Row[]) {
  return {
    eventStore: {
      findMany: jest.fn(async ({ take }: { take: number }) => {
        const now = Date.now();
        return rows
          .filter((r) => r.processedAt == null && r.failedAt == null && r.nextAttemptAt.getTime() <= now)
          .sort((a, b) => Number(a.sequence - b.sequence))
          .slice(0, take);
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
  };
}

const cfg: OutboxWorkerConfig = {
  pollIntervalMs: 60_000,
  batchSize: 50,
  maxAttempts: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 10_000,
};

function makeWorker(rows: Row[], dispatch: jest.Mock) {
  const dispatcher = { dispatch } as unknown as OutboxDispatcher;
  const db = makeFakeDb(rows);
  const worker = new OutboxWorker(db as any, dispatcher, cfg);
  return { worker, db };
}

describe('OutboxWorker.claimBatch', () => {
  it('claims only unprocessed, non-dead-lettered, due events in sequence order', async () => {
    const rows = [
      makeRow({ id: 'a', sequence: 2n }),
      makeRow({ id: 'b', sequence: 1n }),
      makeRow({ id: 'processed', processedAt: new Date() }),
      makeRow({ id: 'dead', failedAt: new Date() }),
      makeRow({ id: 'future', nextAttemptAt: new Date(Date.now() + 60_000) }),
    ];
    const { worker } = makeWorker(rows, jest.fn());
    const batch = await (worker as any).claimBatch();
    expect(batch.map((r: Row) => r.id)).toEqual(['b', 'a']);
  });
});

describe('OutboxWorker.process', () => {
  it('marks the event processed when dispatch succeeds', async () => {
    const row = makeRow();
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const { worker } = makeWorker([row], dispatch);

    await (worker as any).process(row);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(row.processedAt).toBeInstanceOf(Date);
    expect(row.attempts).toBe(1);
    expect(row.failedAt).toBeNull();
  });

  it('passes a reconstructed domain event to the dispatcher', async () => {
    const row = makeRow({ eventType: EventType.MACHINE_OFFLINE, machineId: 'm9' });
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const { worker } = makeWorker([row], dispatch);

    await (worker as any).process(row);

    const event = dispatch.mock.calls[0][0];
    expect(event.eventId).toBe(row.eventId);
    expect(event.eventType).toBe(EventType.MACHINE_OFFLINE);
    expect(event.machineId).toBe('m9');
    expect(event.payload).toEqual(row.payload);
  });

  it('schedules a backoff retry (not processed, not dead) on transient failure', async () => {
    const row = makeRow({ attempts: 0 });
    const dispatch = jest.fn().mockRejectedValue(new Error('push down'));
    const { worker } = makeWorker([row], dispatch);

    const before = Date.now();
    await (worker as any).process(row);

    expect(row.processedAt).toBeNull();
    expect(row.failedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('push down');
    // First retry uses baseBackoffMs (1000ms).
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 1000);
  });

  it('grows the backoff exponentially with attempts', async () => {
    const row = makeRow({ attempts: 1 }); // becomes attempt #2 -> 2 * base
    const dispatch = jest.fn().mockRejectedValue(new Error('still down'));
    const { worker } = makeWorker([row], dispatch);

    const before = Date.now();
    await (worker as any).process(row);

    expect(row.attempts).toBe(2);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 2000);
  });

  it('dead-letters the event once maxAttempts is reached', async () => {
    const row = makeRow({ attempts: cfg.maxAttempts - 1 }); // this attempt hits the cap
    const dispatch = jest.fn().mockRejectedValue(new Error('gone for good'));
    const { worker } = makeWorker([row], dispatch);

    await (worker as any).process(row);

    expect(row.attempts).toBe(cfg.maxAttempts);
    expect(row.failedAt).toBeInstanceOf(Date);
    expect(row.processedAt).toBeNull();
    expect(row.lastError).toContain('gone for good');
  });
});

describe('OutboxWorker.tick', () => {
  it('drains all due events in one pass', async () => {
    const rows = [makeRow({ id: 'a', sequence: 1n }), makeRow({ id: 'b', sequence: 2n })];
    const dispatch = jest.fn().mockResolvedValue(undefined);
    const { worker } = makeWorker(rows, dispatch);
    (worker as any).stopped = false;

    await (worker as any).tick();
    await worker.stop();

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(rows.every((r) => r.processedAt instanceof Date)).toBe(true);
  });
});
