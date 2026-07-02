import { Request, Response, NextFunction } from 'express';
import { AlertService } from './alert.service';

export class AlertController {
  constructor(private readonly service: AlertService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const factoryId = req.user!.factoryId;
      const result = await this.service.listAlerts(factoryId, {
        page: Number(req.query.page) || 1,
        limit: Math.min(Number(req.query.limit) || 20, 100),
        status: req.query.status as any,
        severity: req.query.severity as any,
        machineId: req.query.machineId as string,
        search: req.query.search as string,
        unreadOnly: req.query.unreadOnly === 'true',
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await this.service.getAlert(req.params.id, req.user!.factoryId);
      res.json({ data: alert });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await this.service.createAlert({ ...req.body, factoryId: req.user!.factoryId });
      res.status(201).json({ data: alert });
    } catch (err) {
      next(err);
    }
  };

  takeAction = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await this.service.takeAction(req.params.id, req.user!.factoryId, req.user!.id, req.body);
      res.json({ data: alert });
    } catch (err) {
      next(err);
    }
  };

  getDashboardStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await this.service.getDashboardStats(req.user!.factoryId);
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  };

  markAllRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.markAllRead(req.user!.factoryId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
