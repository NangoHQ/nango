import { z } from 'zod';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { suspendRunner } from '../runner/runner.js';
import { logger } from '../logger.js';

const path = '/idle';
const method = 'POST';

export type PostIdle = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Body: {
        runnerId: string;
        idleTimeMs: number;
    };
    Error: ApiError<'idle_failed'>;
    Success: { status: 'ok' };
}>;

const validate = validateRequest<PostIdle>({
    parseBody: (data) =>
        z
            .object({ runnerId: z.string().min(1), idleTimeMs: z.number().positive() })
            .strict()
            .parse(data)
});

const handler = async (req: EndpointRequest<PostIdle>, res: EndpointResponse<PostIdle>) => {
    try {
        logger.info(`[runner ${req.body.runnerId}]: idle for ${req.body.idleTimeMs}ms. Suspending...`);
        await suspendRunner(req.body.runnerId);
        res.status(200).json({ status: 'ok' });
        return;
    } catch (err) {
        res.status(500).json({ error: { code: 'idle_failed', message: err instanceof Error ? err.message : 'failed to suspend runner' } });
        return;
    }
};

export const routeHandler: RouteHandler<PostIdle> = {
    path,
    method,
    validate,
    handler
};
