import { Request, Response, NextFunction } from 'express';
import { MachineService } from './machine.service';

export class MachineController {
  constructor(private readonly service: MachineService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const machines = await this.service.listMachines(req.user!.factoryId, {
        search: req.query.search as string,
        status: req.query.status as any,
      });
      res.json({ data: machines });
    } catch (err) {
      next(err);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const machine = await this.service.getMachine(req.params.id, req.user!.factoryId);
      res.json({ data: machine });
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const machine = await this.service.createMachine(req.user!.factoryId, req.body);
      res.status(201).json({ data: machine });
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const machine = await this.service.updateMachineStatus(
        req.params.id,
        req.user!.factoryId,
        req.body.status,
        req.body.reason,
      );
      res.json({ data: machine });
    } catch (err) {
      next(err);
    }
  };

  getStatusSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await this.service.getMachineStatusSummary(req.user!.factoryId);
      res.json({ data: summary });
    } catch (err) {
      next(err);
    }
  };
}
