import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.login(req.body, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.register(req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokens = await this.service.refresh(req.body);
      res.status(200).json({ data: tokens });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      await this.service.logout(refreshToken);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.service.getMe(req.user!.id);
      res.status(200).json({ data: user });
    } catch (err) {
      next(err);
    }
  };
}
