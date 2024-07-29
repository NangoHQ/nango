import { z } from 'zod';
import type { ApiError, Endpoint } from '@nangohq/types';
import { validateRequest } from '@nangohq/utils';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { orchestratorClient } from '../../../clients.js';

const path = '/tasks/:taskId/heartbeat';
const method = 'POST';

type PostHeartbeat = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        taskId: string;
    };
    Body: never;
    Error: ApiError<'heartbeat_failed'>;
    Success: never;
}>;

const validate = validateRequest<PostHeartbeat>({
    parseParams: (data) => z.object({ taskId: z.string().uuid() }).strict().parse(data)
});

const handler = async (req: EndpointRequest<PostHeartbeat>, res: EndpointResponse<PostHeartbeat>) => {
    const { taskId } = req.params;
    const heartbeat = await orchestratorClient.heartbeat({ taskId });
    if (heartbeat.isErr()) {
        res.status(400).json({ error: { code: 'heartbeat_failed', message: `heartbeat failed`, payload: { taskId, error: heartbeat.error } } });
        return;
    }
    res.status(201).send();
    return;
};

export const routeHandler: RouteHandler<PostHeartbeat> = {
    path,
    method,
    validate,
    handler
};
