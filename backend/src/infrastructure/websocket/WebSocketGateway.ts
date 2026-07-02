import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { logger } from '../../config/logger';
import { DomainEvent } from '../../core/events/types';

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  factoryId: string;
  role: string;
  lastPing: number;
}

export class WebSocketGateway {
  private readonly clients = new Map<string, AuthenticatedClient>();
  private readonly wss: WebSocketServer;
  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(private readonly path = '/ws') {
    this.wss = new WebSocketServer({ noServer: true, path });
  }

  attach(server: import('http').Server): void {
    server.on('upgrade', (req, socket, head) => {
      if (req.url === this.path || req.url?.startsWith(`${this.path}?`)) {
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit('connection', ws, req);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.startPingInterval();
    logger.info({ path: this.path }, 'WebSocket gateway started');
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? '', `http://localhost`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    let payload: any;
    try {
      payload = jwt.verify(token, config.JWT_ACCESS_SECRET);
      if (payload.type !== 'access') throw new Error('Invalid token type');
    } catch {
      ws.close(4001, 'Invalid authentication token');
      return;
    }

    const clientId = `${payload.sub}-${Date.now()}`;
    const client: AuthenticatedClient = {
      ws,
      userId: payload.sub,
      factoryId: payload.factoryId,
      role: payload.role,
      lastPing: Date.now(),
    };
    this.clients.set(clientId, client);
    logger.info({ userId: payload.sub, factoryId: payload.factoryId }, 'WebSocket client connected');

    ws.send(JSON.stringify({ type: 'CONNECTED', data: { clientId, factoryId: payload.factoryId } }));

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'PING') {
          client.lastPing = Date.now();
          ws.send(JSON.stringify({ type: 'PONG' }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info({ userId: payload.sub }, 'WebSocket client disconnected');
    });

    ws.on('error', (err) => {
      logger.error({ err, userId: payload.sub }, 'WebSocket client error');
      this.clients.delete(clientId);
    });
  }

  broadcastToFactory(factoryId: string, event: DomainEvent): void {
    const message = JSON.stringify({ type: event.eventType, data: (event as any).payload, eventId: event.eventId, timestamp: event.timestamp });
    let sent = 0;
    for (const [, client] of this.clients) {
      if (client.factoryId === factoryId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
        sent++;
      }
    }
    if (sent > 0) {
      logger.debug({ factoryId, eventType: event.eventType, recipients: sent }, 'WebSocket broadcast');
    }
  }

  broadcastToAll(event: DomainEvent): void {
    const message = JSON.stringify({ type: event.eventType, data: (event as any).payload });
    for (const [, client] of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const timeout = 30_000;
      for (const [id, client] of this.clients) {
        if (Date.now() - client.lastPing > timeout) {
          client.ws.terminate();
          this.clients.delete(id);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: 'PING' }));
        }
      }
    }, 15_000);
  }

  close(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.wss.close();
  }

  get connectedCount(): number {
    return this.clients.size;
  }
}

export const wsGateway = new WebSocketGateway();
