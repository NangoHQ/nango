import { z } from 'zod';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, RouteHandler } from '@nangohq/utils';
import { validateRequest } from '@nangohq/utils';
import { runnersFleet } from '../../runner/fleet.js';

const path = '/runners/:nodeId/register';
const method = 'POST';

export type PostRegister = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        nodeId: number;
    };
    Body: {
        url: string;
    };
    Error: ApiError<'register_failed'>;
    Success: { status: 'ok' };
}>;

const validate = validateRequest<PostRegister>({
    parseParams: (data) => z.object({ nodeId: z.coerce.number().positive() }).strict().parse(data),
    parseBody: (data) =>
        z
            .object({ url: z.string().min(1) })
            .strict()
            .parse(data)
});

const handler = async (req: EndpointRequest<PostRegister>, res: EndpointResponse<PostRegister>) => {
    try {
        const register = await runnersFleet.registerNode({ nodeId: req.params.nodeId, url: req.body.url });
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
    path,
    method,
    validate,
    handler
};
