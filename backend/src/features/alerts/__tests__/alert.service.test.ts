import { AlertStatus, ActionType } from '@prisma/client';
import { AlertService } from '../alert.service';
import { AlertRepository } from '../alert.repository';
import { AppError } from '../../../core/errors/AppError';

// ── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../../config/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../core/events/EventBus', () => ({
  eventBus: {
    publish: jest.fn().mockResolvedValue(undefined),
    createEvent: jest.fn().mockImplementation((partial: object) => ({
      ...partial,
      eventId: 'test-event-id',
      timestamp: '2026-01-01T00:00:00.000Z',
      version: 1,
    })),
  },
}));

jest.mock('../../../infrastructure/esp/EspBridgeClient', () => ({
  espBridge: {
    relayReply: jest.fn().mockResolvedValue({ ok: true, message: 'Relayed' }),
  },
}));

// The service now enqueues events in the same transaction as the state change,
// then hands off to the outbox. Run the transaction callback inline with a stub
// tx client and assert against the outbox rather than a real DB.
jest.mock('../../../infrastructure/database/prisma', () => ({
  prisma: { $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})) },
}));

jest.mock('../../../core/events/outbox/Outbox', () => ({
  outbox: { enqueue: jest.fn().mockResolvedValue(undefined), dispatchInstant: jest.fn() },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import { espBridge } from '../../../infrastructure/esp/EspBridgeClient';
import { outbox } from '../../../core/events/outbox/Outbox';

function makeAlert(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'alert-1',
    title: 'Machine Down',
    description: 'Loom stopped',
    severity: 'HIGH',
    status: AlertStatus.OPEN,
    isRead: false,
    machineId: 'machine-1',
    factoryId: 'factory-1',
    createdAt: new Date('2026-01-01T06:00:00Z'),
    updatedAt: new Date('2026-01-01T06:00:00Z'),
    resolvedAt: null,
    machine: { name: 'Loom 1' },
    metadata: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<Record<string, jest.Mock>> = {}): AlertRepository {
  return {
    findMany:      jest.fn().mockResolvedValue({ alerts: [], total: 0 }),
    findById:      jest.fn().mockResolvedValue(makeAlert()),
    create:        jest.fn().mockResolvedValue(makeAlert()),
    update:        jest.fn().mockResolvedValue(makeAlert()),
    markRead:      jest.fn().mockResolvedValue(undefined),
    markAllRead:   jest.fn().mockResolvedValue(undefined),
    createAction:  jest.fn().mockResolvedValue(undefined),
    addTimelineEntry: jest.fn().mockResolvedValue(undefined),
    getReplyContext: jest.fn().mockResolvedValue({ userExternalId: 'ext-u1', factoryExternalId: 'ext-f1' }),
    countByStatus: jest.fn().mockResolvedValue([]),
    countUnread:   jest.fn().mockResolvedValue(0),
    countCritical: jest.fn().mockResolvedValue(0),
    ...overrides,
  } as unknown as AlertRepository;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('AlertService', () => {
  let service: AlertService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = makeRepo();
    service = new AlertService(repo);
  });

  // ── listAlerts ─────────────────────────────────────────────────────────────

  describe('listAlerts', () => {
    it('returns an array of shaped alert objects under data', async () => {
      const alert = makeAlert();
      (repo.findMany as jest.Mock).mockResolvedValue({ alerts: [alert], total: 1 });
      const result = await service.listAlerts('factory-1', { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('alert-1');
      expect(result.data[0].title).toBe('Machine Down');
    });

    it('exposes machineName from the nested machine relation', async () => {
      const alert = makeAlert({ machine: { name: 'Loom 42' } });
      (repo.findMany as jest.Mock).mockResolvedValue({ alerts: [alert], total: 1 });
      const { data } = await service.listAlerts('factory-1', {});
      expect(data[0].machineName).toBe('Loom 42');
    });

    it('createdAt and updatedAt are ISO strings', async () => {
      (repo.findMany as jest.Mock).mockResolvedValue({ alerts: [makeAlert()], total: 1 });
      const { data } = await service.listAlerts('factory-1', {});
      expect(() => new Date(data[0].createdAt)).not.toThrow();
    });

    it('meta.total reflects the total from the repo', async () => {
      (repo.findMany as jest.Mock).mockResolvedValue({ alerts: [], total: 55 });
      const { meta } = await service.listAlerts('factory-1', { page: 1, limit: 20 });
      expect(meta.total).toBe(55);
    });

    it('meta.hasMore is true when more pages exist', async () => {
      (repo.findMany as jest.Mock).mockResolvedValue({ alerts: [], total: 100 });
      const { meta } = await service.listAlerts('factory-1', { page: 1, limit: 20 });
      expect(meta.hasMore).toBe(true);
    });

    it('meta.hasMore is false on the last page', async () => {
      (repo.findMany as jest.Mock).mockResolvedValue({ alerts: [], total: 20 });
      const { meta } = await service.listAlerts('factory-1', { page: 1, limit: 20 });
      expect(meta.hasMore).toBe(false);
    });

    it('defaults page=1 and limit=20 when not provided', async () => {
      (repo.findMany as jest.Mock).mockResolvedValue({ alerts: [], total: 0 });
      const { meta } = await service.listAlerts('factory-1', {});
      expect(meta.page).toBe(1);
      expect(meta.limit).toBe(20);
    });
  });

  // ── getAlert ───────────────────────────────────────────────────────────────

  describe('getAlert', () => {
    it('throws AppError 404 when alert is not found', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.getAlert('nonexistent', 'factory-1')).rejects.toThrow(AppError);
      await expect(service.getAlert('nonexistent', 'factory-1')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('marks the alert as read when isRead is false', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ isRead: false }));
      await service.getAlert('alert-1', 'factory-1');
      expect(repo.markRead).toHaveBeenCalledWith('alert-1');
    });

    it('does not mark as read when isRead is already true', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ isRead: true }));
      await service.getAlert('alert-1', 'factory-1');
      expect(repo.markRead).not.toHaveBeenCalled();
    });

    it('returns availableActions based on current status', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.OPEN }));
      const result = await service.getAlert('alert-1', 'factory-1');
      expect(Array.isArray(result.availableActions)).toBe(true);
      const types = result.availableActions.map((a: any) => a.actionType);
      expect(types).toContain(ActionType.ACKNOWLEDGE);
    });

    it('returns empty availableActions for CLOSED alerts except COMMENT', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.CLOSED }));
      const result = await service.getAlert('alert-1', 'factory-1');
      const types = result.availableActions.map((a: any) => a.actionType);
      expect(types).toContain(ActionType.COMMENT);
      expect(types).not.toContain(ActionType.ACKNOWLEDGE);
    });
  });

  // ── createAlert ────────────────────────────────────────────────────────────

  describe('createAlert', () => {
    const dto = {
      title: 'New Alert',
      description: 'Something broke',
      severity: 'HIGH' as const,
      machineId: 'machine-1',
      factoryId: 'factory-1',
    };

    it('creates the alert via the repo inside the transaction', async () => {
      await service.createAlert(dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Alert', factoryId: 'factory-1' }),
        expect.anything(), // tx client
      );
    });

    it('enqueues an ALERT_CREATED event then dispatches it after commit', async () => {
      await service.createAlert(dto);
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ALERT_CREATED', eventId: 'test-event-id' }),
        expect.anything(), // same tx as the alert insert
      );
      expect(outbox.dispatchInstant).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'test-event-id' }),
      );
    });

    it('returns the created alert from the repo', async () => {
      const created = makeAlert({ title: 'New Alert' });
      (repo.create as jest.Mock).mockResolvedValue(created);
      const result = await service.createAlert(dto);
      expect(result.id).toBe('alert-1');
    });
  });

  // ── takeAction ─────────────────────────────────────────────────────────────

  describe('takeAction', () => {
    it('throws AppError 404 when alert does not exist', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.takeAction('bad-id', 'factory-1', 'user-1', { actionType: ActionType.ACKNOWLEDGE }))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws AppError 400 for an invalid status transition', async () => {
      // CLOSED → ACKNOWLEDGE is not allowed
      (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.CLOSED }));
      await expect(
        service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.ACKNOWLEDGE }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    describe('ACKNOWLEDGE: OPEN → ACKNOWLEDGED', () => {
      beforeEach(() => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.OPEN }));
      });

      it('calls repo.update with ACKNOWLEDGED status', async () => {
        await service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.ACKNOWLEDGE });
        expect(repo.update).toHaveBeenCalledWith(
          'alert-1',
          expect.objectContaining({ status: AlertStatus.ACKNOWLEDGED }),
          expect.anything(), // tx client
        );
      });

      it('records the action in the repo', async () => {
        await service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.ACKNOWLEDGE });
        expect(repo.createAction).toHaveBeenCalledWith(
          expect.objectContaining({ alertId: 'alert-1', actionType: ActionType.ACKNOWLEDGE }),
          expect.anything(), // tx client
        );
      });

      it('adds a timeline entry', async () => {
        await service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.ACKNOWLEDGE });
        expect(repo.addTimelineEntry).toHaveBeenCalled();
      });

      it('enqueues an ALERT_UPDATED event and dispatches it', async () => {
        await service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.ACKNOWLEDGE });
        expect(outbox.enqueue).toHaveBeenCalledWith(
          expect.objectContaining({ eventType: 'ALERT_UPDATED' }),
          expect.anything(),
        );
        expect(outbox.dispatchInstant).toHaveBeenCalled();
      });
    });

    describe('START_REPAIR: OPEN → IN_PROGRESS', () => {
      it('updates status to IN_PROGRESS', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.OPEN }));
        await service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.START_REPAIR });
        expect(repo.update).toHaveBeenCalledWith(
          'alert-1',
          expect.objectContaining({ status: AlertStatus.IN_PROGRESS }),
          expect.anything(),
        );
      });
    });

    describe('RESOLVE: IN_PROGRESS → RESOLVED', () => {
      it('updates status to RESOLVED and sets resolvedAt', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.IN_PROGRESS }));
        await service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.RESOLVE });
        expect(repo.update).toHaveBeenCalledWith(
          'alert-1',
          expect.objectContaining({ status: AlertStatus.RESOLVED, resolvedAt: expect.any(Date) }),
          expect.anything(),
        );
      });
    });

    describe('CLOSE: RESOLVED → CLOSED', () => {
      it('updates status to CLOSED', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.RESOLVED }));
        await service.takeAction('alert-1', 'factory-1', 'user-1', { actionType: ActionType.CLOSE });
        expect(repo.update).toHaveBeenCalledWith(
          'alert-1',
          expect.objectContaining({ status: AlertStatus.CLOSED }),
          expect.anything(),
        );
      });
    });

    describe('COMMENT: no status change', () => {
      it('does not call repo.update when actionType is COMMENT', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.OPEN }));
        await service.takeAction('alert-1', 'factory-1', 'user-1', {
          actionType: ActionType.COMMENT,
          comment: 'Checked the motor',
        });
        expect(repo.update).not.toHaveBeenCalled();
      });

      it('still adds an action and timeline entry', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.OPEN }));
        await service.takeAction('alert-1', 'factory-1', 'user-1', {
          actionType: ActionType.COMMENT,
          comment: 'Checked the motor',
        });
        expect(repo.createAction).toHaveBeenCalled();
        expect(repo.addTimelineEntry).toHaveBeenCalled();
      });

      it('includes the comment in the timeline description', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.OPEN }));
        await service.takeAction('alert-1', 'factory-1', 'user-1', {
          actionType: ActionType.COMMENT,
          comment: 'checked bearings',
        });
        const call = (repo.addTimelineEntry as jest.Mock).mock.calls[0][0];
        expect(call.description).toContain('checked bearings');
      });
    });

    describe('ESCALATE: no status change', () => {
      it('does not call repo.update', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.OPEN }));
        await service.takeAction('alert-1', 'factory-1', 'user-1', {
          actionType: ActionType.ESCALATE,
          comment: 'Needs supervisor',
        });
        expect(repo.update).not.toHaveBeenCalled();
      });
    });

    describe('invalid transitions', () => {
      it('CLOSED → RESOLVE throws 400', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.CLOSED }));
        await expect(
          service.takeAction('alert-1', 'factory-1', 'u1', { actionType: ActionType.RESOLVE }),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it('IN_PROGRESS → ACKNOWLEDGE throws 400', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.IN_PROGRESS }));
        await expect(
          service.takeAction('alert-1', 'factory-1', 'u1', { actionType: ActionType.ACKNOWLEDGE }),
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      it('RESOLVED → START_REPAIR throws 400', async () => {
        (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ status: AlertStatus.RESOLVED }));
        await expect(
          service.takeAction('alert-1', 'factory-1', 'u1', { actionType: ActionType.START_REPAIR }),
        ).rejects.toMatchObject({ statusCode: 400 });
      });
    });
  });

  // ── getDashboardStats ──────────────────────────────────────────────────────

  describe('getDashboardStats', () => {
    it('returns zero counts when nothing is returned by the repo', async () => {
      (repo.countByStatus as jest.Mock).mockResolvedValue([]);
      (repo.countUnread as jest.Mock).mockResolvedValue(0);
      (repo.countCritical as jest.Mock).mockResolvedValue(0);
      const stats = await service.getDashboardStats('factory-1');
      expect(stats.openCount).toBe(0);
      expect(stats.unreadCount).toBe(0);
      expect(stats.criticalCount).toBe(0);
    });

    it('aggregates status counts from the repo', async () => {
      (repo.countByStatus as jest.Mock).mockResolvedValue([
        { status: AlertStatus.OPEN,        _count: { status: 5 } },
        { status: AlertStatus.IN_PROGRESS, _count: { status: 2 } },
        { status: AlertStatus.RESOLVED,    _count: { status: 10 } },
      ]);
      (repo.countUnread as jest.Mock).mockResolvedValue(3);
      (repo.countCritical as jest.Mock).mockResolvedValue(1);
      const stats = await service.getDashboardStats('factory-1');
      expect(stats.openCount).toBe(5);
      expect(stats.inProgressCount).toBe(2);
      expect(stats.resolvedCount).toBe(10);
      expect(stats.unreadCount).toBe(3);
      expect(stats.criticalCount).toBe(1);
    });
  });

  // ── respondToAlert ─────────────────────────────────────────────────────────

  describe('respondToAlert', () => {
    it('throws 404 when alert does not exist', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.respondToAlert('bad', 'f1', 'u1', 'opt-1'))
        .rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 400 when the alert has no options in metadata', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(makeAlert({ metadata: {} }));
      await expect(service.respondToAlert('alert-1', 'f1', 'u1', 'opt-1'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 400 when the chosen option id is not in the options list', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(
        makeAlert({ metadata: { kind: 'downtime_reason', options: [{ id: 'opt-a', label: 'Yarn' }] } }),
      );
      await expect(service.respondToAlert('alert-1', 'f1', 'u1', 'opt-z'))
        .rejects.toMatchObject({ statusCode: 400 });
    });

    it('adds a WORKER_REPLY timeline entry for a valid option', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(
        makeAlert({ metadata: { kind: 'downtime_reason', options: [{ id: 'opt-a', label: 'Yarn breakage' }] } }),
      );
      await service.respondToAlert('alert-1', 'f1', 'u1', 'opt-a');
      expect(repo.addTimelineEntry).toHaveBeenCalledWith(expect.objectContaining({
        eventType: 'WORKER_REPLY',
      }));
    });

    it('acknowledges an OPEN alert after a valid reply', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(
        makeAlert({
          status: AlertStatus.OPEN,
          metadata: { options: [{ id: 'opt-a', label: 'Yarn breakage' }] },
        }),
      );
      await service.respondToAlert('alert-1', 'f1', 'u1', 'opt-a');
      expect(repo.update).toHaveBeenCalledWith('alert-1', expect.objectContaining({
        status: AlertStatus.ACKNOWLEDGED,
      }));
    });

    it('does not change status when alert is already past OPEN', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(
        makeAlert({
          status: AlertStatus.IN_PROGRESS,
          metadata: { options: [{ id: 'opt-a', label: 'Yarn breakage' }] },
        }),
      );
      await service.respondToAlert('alert-1', 'f1', 'u1', 'opt-a');
      // update should only set isRead, not status
      const call = (repo.update as jest.Mock).mock.calls[0][1];
      expect(call.status).toBeUndefined();
    });

    it('relays the reply to the ESP bridge', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(
        makeAlert({ metadata: { options: [{ id: 'opt-a', label: 'Yarn breakage' }] } }),
      );
      await service.respondToAlert('alert-1', 'f1', 'u1', 'opt-a');
      expect(espBridge.relayReply).toHaveBeenCalledWith(expect.objectContaining({
        replyId: 'opt-a',
      }));
    });

    it('returns ok and a message on success', async () => {
      (repo.findById as jest.Mock).mockResolvedValue(
        makeAlert({ metadata: { options: [{ id: 'opt-a', label: 'Yarn breakage' }] } }),
      );
      const result = await service.respondToAlert('alert-1', 'f1', 'u1', 'opt-a');
      expect(result.ok).toBe(true);
    });
  });
});
