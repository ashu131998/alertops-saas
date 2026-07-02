import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../../config';
import { AppError } from '../errors/AppError';

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  factoryId: string;
  type: 'access';
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Missing or invalid authorization header'));
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (payload.type !== 'access') {
      return next(AppError.unauthorized('Invalid token type'));
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      factoryId: payload.factoryId,
    };
    next();
  } catch {
    return next(AppError.unauthorized('Invalid or expired token'));
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden('Insufficient permissions'));
    next();
  };
}
