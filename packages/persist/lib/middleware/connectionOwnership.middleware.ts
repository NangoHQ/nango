import { connectionService } from '@nangohq/shared';

import type { AuthLocals } from './auth.middleware.js';
import type { NextFunction, Request, Response } from 'express';

export const connectionOwnershipMiddleware = async (req: Request, res: Response<any, AuthLocals>, next: NextFunction) => {
    const nangoConnectionId = Number(req.params['nangoConnectionId']);
    if (!Number.isInteger(nangoConnectionId) || nangoConnectionId <= 0) {
        res.status(400).json({ error: { code: 'invalid_connection_id', message: 'Invalid or missing connection id' } });
        return;
    }

    const exists = await connectionService.connectionExistsForEnvironment(nangoConnectionId, res.locals.environment.id);
    if (!exists) {
        res.status(404).json({ error: { code: 'connection_not_found', message: 'Connection not found' } });
        return;
    }

    next();
};
