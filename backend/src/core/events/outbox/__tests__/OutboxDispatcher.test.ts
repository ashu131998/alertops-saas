import { OutboxDispatcher } from '../OutboxDispatcher';
import { EventType, DomainEvent } from '../../types';

jest.mock('../../../../config/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function makeEvent(eventType: EventType = EventType.ALERT_CREATED): DomainEvent {
  return {
    eventId: 'evt-1',
    eventType,
    timestamp: new Date().toISOString(),
    version: 1,
    factoryId: 'f1',
    payload: {} as any,
  } as unknown as DomainEvent;
}

describe('OutboxDispatcher', () => {
  it('is a no-op when no handlers are registered', async () => {
    const d = new OutboxDispatcher();
    await expect(d.dispatch(makeEvent())).resolves.toBeUndefined();
    expect(d.hasHandlers(EventType.ALERT_CREATED)).toBe(false);
  });

  it('runs every handler registered for the event type', async () => {
    const d = new OutboxDispatcher();
    const h1 = jest.fn().mockResolvedValue(undefined);
    const h2 = jest.fn().mockResolvedValue(undefined);
    d.subscribe(EventType.ALERT_CREATED, h1);
    d.subscribe(EventType.ALERT_CREATED, h2);

    await d.dispatch(makeEvent(EventType.ALERT_CREATED));

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
    expect(d.hasHandlers(EventType.ALERT_CREATED)).toBe(true);
  });

  it('does not fire handlers of a different event type', async () => {
    const d = new OutboxDispatcher();
    const handler = jest.fn().mockResolvedValue(undefined);
    d.subscribe(EventType.MACHINE_OFFLINE, handler);
    await d.dispatch(makeEvent(EventType.ALERT_CREATED));
    expect(handler).not.toHaveBeenCalled();
  });

  it('attempts all handlers even when one rejects, then throws', async () => {
    const d = new OutboxDispatcher();
    const failing = jest.fn().mockRejectedValue(new Error('boom'));
    const passing = jest.fn().mockResolvedValue(undefined);
    d.subscribe(EventType.ALERT_CREATED, failing);
    d.subscribe(EventType.ALERT_CREATED, passing);

    await expect(d.dispatch(makeEvent())).rejects.toBeInstanceOf(AggregateError);
    // The passing handler still ran — a failure doesn't starve siblings.
    expect(passing).toHaveBeenCalledTimes(1);
  });

  it('resolves when all handlers succeed', async () => {
    const d = new OutboxDispatcher();
    d.subscribe(EventType.ALERT_CREATED, jest.fn().mockResolvedValue(undefined));
    await expect(d.dispatch(makeEvent())).resolves.toBeUndefined();
  });
});
