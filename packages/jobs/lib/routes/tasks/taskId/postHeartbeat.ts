import { z } from 'zod';

import { validateRequest } from '@nangohq/utils';

import { orchestratorClient } from '../../../clients.js';

import type { PostHeartbeat } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';

const validate = validateRequest<PostHeartbeat>({
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).strict().parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PostHeartbeat>) => {
    const { taskId } = res.locals.parsedParams;
    const heartbeat = await orchestratorClient.heartbeat({ taskId });
    if (heartbeat.isErr()) {
        res.status(400).json({ error: { code: 'heartbeat_failed', message: `heartbeat failed`, payload: { taskId, error: heartbeat.error } } });
        return;
    }
    res.status(201).send();
    return;
};

export const routeHandler: RouteHandler<PostHeartbeat> = {
    method: 'POST',
    path: '/tasks/:taskId/heartbeat',
    validate,
    handler
};
