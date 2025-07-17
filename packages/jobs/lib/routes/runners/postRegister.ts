import * as z from 'zod';

import { validateRequest } from '@nangohq/utils';

import { runnersFleet } from '../../runner/fleet.js';

import type { PostRegister } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';

const validate = validateRequest<PostRegister>({
    parseParams: (data) => z.object({ nodeId: z.coerce.number().positive() }).strict().parse(data),
    parseBody: (data) =>
        z
            .object({ url: z.string().min(1) })
            .strict()
            .parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PostRegister>) => {
    try {
        const register = await runnersFleet.registerNode({ nodeId: res.locals.parsedParams.nodeId, url: res.locals.parsedBody.url });
        if (register.isErr()) {
            throw register.error;
        }
        res.status(200).json({ status: 'ok' });
        return;
    } catch (err) {
        res.status(500).json({ error: { code: 'register_failed', message: err instanceof Error ? err.message : 'failed to register runner' } });
        return;
    }
};

export const routeHandler: RouteHandler<PostRegister> = {
    method: 'POST',
    path: '/runners/:nodeId/register',
    validate,
    handler
};
