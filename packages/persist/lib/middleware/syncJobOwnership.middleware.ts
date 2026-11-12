import * as z from 'zod';

import { syncJobBelongsTo } from '@nangohq/shared';

import { logger } from '../logger.js';

import type { AuthLocals } from './auth.middleware.js';
import type { NextFunction, Request, Response } from 'express';

const paramsSchema = z.object({
    nangoConnectionId: z.coerce.number().int().positive(),
    syncId: z.uuid(),
    syncJobId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
});

/**
 * Rejects a `:syncJobId` that is not this path's sync, connection, and environment.
 * Missing and foreign ids share one 404 so a caller cannot tell them apart.
 */
export const syncJobOwnershipMiddleware = async (req: Request, res: Response<unknown, AuthLocals>, next: NextFunction) => {
    const parsed = paramsSchema.safeParse({
        nangoConnectionId: req.params['nangoConnectionId'],
        syncId: req.params['syncId'],
        syncJobId: req.params['syncJobId']
    });
    if (!parsed.success) {
        syncJobNotFound(res);
        return;
    }

    try {
        const belongs = await syncJobBelongsTo({
            ...parsed.data,
            environmentId: res.locals.environment.id
        });
        if (!belongs) {
            syncJobNotFound(res);
            return;
        }
    } catch (err) {
        logger.error('Failed to check sync job ownership', { error: err });
        res.status(500).json({ error: { code: 'server_error', message: 'Internal server error' } });
        return;
    }

    next();
};

function syncJobNotFound(res: Response): void {
    res.status(404).json({ error: { code: 'sync_job_not_found', message: 'Sync job not found' } });
}
