import { EventBus, eventBus } from '../EventBus';
import { EventType, DomainEvent, BaseEvent } from '../types';

// Mock the logger so pino doesn't emit output during tests.
jest.mock('../../../config/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Helper to build a minimal valid event.
function makeEvent(
  eventType: EventType = EventType.ALERT_CREATED,
  factoryId = 'factory-1',
): DomainEvent {
  return {
    eventId: 'evt-test-1',
    eventType,
    timestamp: new Date().toISOString(),
    version: 1,
    factoryId,
    payload: {} as any,
  } as unknown as DomainEvent;
}

describe('EventBus singleton', () => {
  it('getInstance() always returns the same instance', () => {
    const a = EventBus.getInstance();
    const b = EventBus.getInstance();
    expect(a).toBe(b);
  });

  it('exported eventBus is the same instance as getInstance()', () => {
    expect(eventBus).toBe(EventBus.getInstance());
  });
});

describe('subscribe & unsubscribe', () => {
  beforeEach(() => {
    (eventBus as any).handlers.clear();
  });

  it('registers a handler and returns an unsubscribe function', () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const unsub = eventBus.subscribe(EventType.ALERT_CREATED, handler);
    expect(typeof unsub).toBe('function');
  });

  it('unsubscribing removes the handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const unsub = eventBus.subscribe(EventType.ALERT_CREATED, handler);
    unsub();
    await eventBus.publish(makeEvent(EventType.ALERT_CREATED));
    expect(handler).not.toHaveBeenCalled();
  });

  it('calling unsubscribe twice does not throw', () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const unsub = eventBus.subscribe(EventType.ALERT_CREATED, handler);
    expect(() => { unsub(); unsub(); }).not.toThrow();
  });

  it('multiple handlers for the same event type can be registered', async () => {
    const h1 = jest.fn().mockResolvedValue(undefined);
    const h2 = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribe(EventType.ALERT_CREATED, h1);
    eventBus.subscribe(EventType.ALERT_CREATED, h2);
    await eventBus.publish(makeEvent(EventType.ALERT_CREATED));
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it('handlers only fire for their own event type', async () => {
    const alertHandler   = jest.fn().mockResolvedValue(undefined);
    const machineHandler = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribe(EventType.ALERT_CREATED, alertHandler);
    eventBus.subscribe(EventType.MACHINE_ONLINE, machineHandler);
    await eventBus.publish(makeEvent(EventType.ALERT_CREATED));
    expect(alertHandler).toHaveBeenCalledTimes(1);
    expect(machineHandler).not.toHaveBeenCalled();
  });
});

describe('publish', () => {
  beforeEach(() => {
    (eventBus as any).handlers.clear();
  });

  it('resolves without throwing when no handlers are registered', async () => {
    await expect(eventBus.publish(makeEvent(EventType.ALERT_CREATED))).resolves.not.toThrow();
  });

  it('passes the full event object to the handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribe(EventType.ALERT_CREATED, handler);
    const event = makeEvent(EventType.ALERT_CREATED);
    await eventBus.publish(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('continues calling remaining handlers when one throws', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('handler boom'));
    const passing = jest.fn().mockResolvedValue(undefined);
    eventBus.subscribe(EventType.ALERT_CREATED, failing);
    eventBus.subscribe(EventType.ALERT_CREATED, passing);
    await expect(eventBus.publish(makeEvent(EventType.ALERT_CREATED))).resolves.not.toThrow();
    expect(passing).toHaveBeenCalledTimes(1);
  });

  it('awaits all handlers concurrently via Promise.allSettled', async () => {
    const order: number[] = [];
    const slow = jest.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    const fast = jest.fn().mockImplementation(async () => {
      order.push(2);
    });
    eventBus.subscribe(EventType.ALERT_UPDATED, slow);
    eventBus.subscribe(EventType.ALERT_UPDATED, fast);
    await eventBus.publish(makeEvent(EventType.ALERT_UPDATED));
    // Both ran; order shows fast ran first since they're concurrent.
    expect(order).toContain(1);
    expect(order).toContain(2);
  });
});

describe('createEvent', () => {
  it('adds eventId as a non-empty string', () => {
    const event = eventBus.createEvent({
      eventType: EventType.ALERT_CREATED,
      factoryId: 'f1',
      payload: {} as any,
    } as any);
    expect(typeof event.eventId).toBe('string');
    expect(event.eventId.length).toBeGreaterThan(0);
  });

  it('adds a valid ISO timestamp', () => {
    const event = eventBus.createEvent({
      eventType: EventType.ALERT_CREATED,
      factoryId: 'f1',
      payload: {} as any,
    } as any);
    expect(() => new Date(event.timestamp)).not.toThrow();
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
  });

  it('sets version to 1', () => {
    const event = eventBus.createEvent({
      eventType: EventType.MACHINE_ONLINE,
      factoryId: 'f1',
    } as any);
    expect(event.version).toBe(1);
  });

  it('preserves the caller-supplied fields', () => {
    const partial = { eventType: EventType.ALERT_CREATED, factoryId: 'f42', machineId: 'm9' };
    const event = eventBus.createEvent(partial as any);
    expect(event.factoryId).toBe('f42');
    expect(event.machineId).toBe('m9');
  });

  it('each call produces a unique eventId', () => {
    const base = { eventType: EventType.ALERT_CREATED, factoryId: 'f1', payload: {} as any };
    const a = eventBus.createEvent(base as any);
    const b = eventBus.createEvent(base as any);
    expect(a.eventId).not.toBe(b.eventId);
  });
});
