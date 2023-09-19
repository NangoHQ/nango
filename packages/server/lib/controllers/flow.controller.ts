import type { Request, Response } from 'express';
import type { NextFunction } from 'express';
import { flowService } from '@nangohq/shared';

class FlowController {
    public async getFlows(_req: Request, res: Response, next: NextFunction) {
        try {
            const flows = flowService.getAllAvailableFlows();

            res.send(flows);
        } catch (e) {
            next(e);
        }
    }
}

export default new FlowController();
