import { z } from 'zod';

import { validateRequest } from '@nangohq/utils';

import { runnersFleet } from '../../runner/fleet.js';

import type { PostIdle } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';

const validate = validateRequest<PostIdle>({
    parseParams: (data) => z.object({ nodeId: z.coerce.number().positive() }).strict().parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PostIdle>) => {
    try {
        const idle = await runnersFleet.idleNode({ nodeId: res.locals.params.nodeId });
        if (idle.isErr()) {
            throw idle.error;
        }
        res.status(200).json({ status: 'ok' });
        return;
    } catch (err) {
        res.status(500).json({ error: { code: 'idle_failed', message: err instanceof Error ? err.message : 'failed to idle runner' } });
        return;
    }
};

export const routeHandler: RouteHandler<PostIdle> = {
    path: '/runners/:nodeId/idle',
    method: 'POST',
    validate,
    handler
};
