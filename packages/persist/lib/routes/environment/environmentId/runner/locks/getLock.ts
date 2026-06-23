import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../coordination/index.js';
import { environmentIdParamsSchema, hasLockQuerySchema } from '../validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { GetRunnerLock } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/locks';
const method = 'GET';

const validate = validateRequest<GetRunnerLock>({
    parseParams: (data) => environmentIdParamsSchema.parse(data),
    parseQuery: (data) => hasLockQuerySchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<GetRunnerLock, AuthLocals>) => {
    const {
        parsedQuery: { owner, key },
        parsedParams: { environmentId }
    } = res.locals;

    const result = await coordination.hasLock({ owner, key, namespace: environmentId });
    if (result.isErr()) {
        res.status(500).json({ error: { code: 'has_lock_failed', message: result.error.message } });
        return;
    }

    res.json({ hasLock: result.value });
};

export const route: Route<GetRunnerLock> = { method, path };

export const routeHandler: RouteHandler<GetRunnerLock, AuthLocals> = {
    ...route,
    validate,
    handler
};
