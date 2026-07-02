import pino from 'pino';
import { config } from './index';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport:
    config.isDev
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  base: { service: 'industrial-saas-backend', env: config.NODE_ENV },
});
