'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../auth/store/authStore';
import type { WsMessage } from '../../lib/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000/ws';

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();
  const { accessToken, isAuthenticated } = useAuthStore();

  const connect = useCallback(() => {
    if (!accessToken || !isAuthenticated) return;
    if (ws.current?.readyState === WebSocket.OPEN) return;

    ws.current = new WebSocket(`${WS_URL}?token=${accessToken}`);

    ws.current.onopen = () => {
      console.log('[WS] Connected');
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };

    ws.current.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {}
    };

    ws.current.onclose = () => {
      console.log('[WS] Disconnected, reconnecting in 3s...');
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };
  }, [accessToken, isAuthenticated]);

  const handleMessage = useCallback((msg: WsMessage) => {
    switch (msg.type) {
      case 'ALERT_CREATED':
      case 'ALERT_UPDATED':
      case 'ALERT_STATUS_CHANGED':
        qc.invalidateQueries({ queryKey: ['alerts'] });
        qc.invalidateQueries({ queryKey: ['alert-stats'] });
        break;
      case 'MACHINE_STATUS_CHANGED':
      case 'MACHINE_ONLINE':
      case 'MACHINE_OFFLINE':
        qc.invalidateQueries({ queryKey: ['machines'] });
        break;
      case 'PING':
        ws.current?.send(JSON.stringify({ type: 'PONG' }));
        break;
    }
  }, [qc]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  return { isConnected: ws.current?.readyState === WebSocket.OPEN };
}
