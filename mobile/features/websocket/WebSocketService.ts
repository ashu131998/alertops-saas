import Constants from 'expo-constants';
import { queryClient } from '../../lib/queryClient';

const WS_URL = (Constants.expoConfig?.extra?.wsUrl as string) ?? 'ws://localhost:4000/ws';

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private shouldConnect = false;

  connect(accessToken: string) {
    this.token = accessToken;
    this.shouldConnect = true;
    this.openSocket();
  }

  disconnect() {
    this.shouldConnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private openSocket() {
    if (!this.token || !this.shouldConnect) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(`${WS_URL}?token=${this.token}`);

    this.ws.onopen = () => {
      console.log('[WS] Connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {}
    };

    this.ws.onclose = () => {
      if (this.shouldConnect) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), 3000);
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private handleMessage(msg: { type: string; data: unknown }) {
    switch (msg.type) {
      case 'ALERT_CREATED':
      case 'ALERT_UPDATED':
      case 'ALERT_STATUS_CHANGED':
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
        queryClient.invalidateQueries({ queryKey: ['alert-stats'] });
        break;
      case 'MACHINE_STATUS_CHANGED':
      case 'MACHINE_ONLINE':
      case 'MACHINE_OFFLINE':
        queryClient.invalidateQueries({ queryKey: ['machines'] });
        break;
      case 'PING':
        this.ws?.send(JSON.stringify({ type: 'PONG' }));
        break;
    }
  }
}

export const wsService = new WebSocketService();
