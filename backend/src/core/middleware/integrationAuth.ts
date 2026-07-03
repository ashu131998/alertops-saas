import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { AppError } from '../errors/AppError';

/**
 * Authenticates server-to-server calls from the ESP-IoT query-api bridge.
 *
 * The bridge sends a shared secret in the `x-integration-key` header. This is
 * intentionally separate from the user JWT auth: the bridge acts on behalf of
 * the platform (provisioning worker accounts, pushing machine/shift alerts),
 * not on behalf of a logged-in user.
 */
export function integrationAuth(req: Request, _res: Response, next: NextFunction) {
  const expected = config.INTEGRATION_API_KEY;
  if (!expected) {
    return next(AppError.forbidden('Integration API is not configured'));
  }

  const provided = req.headers['x-integration-key'];
  if (typeof provided !== 'string' || provided !== expected) {
    return next(AppError.unauthorized('Invalid integration key'));
  }

  next();
}
