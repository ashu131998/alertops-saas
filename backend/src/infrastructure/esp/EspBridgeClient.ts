import { config } from '../../config';
import { logger } from '../../config/logger';

/**
 * Relays a worker's interactive reply (downtime reason / config selection) back
 * to the ESP-IoT query-api, which applies it to the factory dashboard. This is
 * the reverse direction of the integration bridge and reuses the same shared
 * INTEGRATION_API_KEY.
 */
export class EspBridgeClient {
  async relayReply(input: {
    replyId: string;
    externalWorkerId?: string | null;
    externalFactoryId?: string | null;
  }): Promise<{ ok: boolean; message?: string; error?: string }> {
    if (!config.INTEGRATION_API_KEY) {
      return { ok: false, error: 'Integration bridge is not configured' };
    }
    try {
      const res = await fetch(`${config.ESP_IOT_API_URL.replace(/\/$/, '')}/v1/integration/alert-reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-integration-key': config.INTEGRATION_API_KEY,
        },
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        logger.warn({ status: res.status, error: body?.error }, 'esp bridge reply relay failed');
        return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
      }
      return { ok: true, message: body?.message };
    } catch (err) {
      logger.error({ err }, 'esp bridge reply relay error');
      return { ok: false, error: (err as Error).message };
    }
  }
}

export const espBridge = new EspBridgeClient();
