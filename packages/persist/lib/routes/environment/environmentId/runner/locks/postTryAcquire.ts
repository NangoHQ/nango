import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../coordination/index.js';
import { environmentIdParamsSchema, tryAcquireLockBodySchema } from '../validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { PostRunnerLockTryAcquire } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/locks/try-acquire';
const method = 'POST';

const validate = validateRequest<PostRunnerLockTryAcquire>({
    parseParams: (data) => environmentIdParamsSchema.parse(data),
    parseBody: (data) => tryAcquireLockBodySchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PostRunnerLockTryAcquire, AuthLocals>) => {
    const {
        parsedBody: { owner, key, ttlMs }
    } = res.locals;

    const result = await coordination.tryAcquireLock({ owner, key, ttlMs });
    if (result.isErr()) {
        res.status(500).json({ error: { code: 'try_acquire_lock_failed', message: result.error.message } });
        return;
    }

    res.json({ acquired: result.value });
};

export const route: Route<PostRunnerLockTryAcquire> = { method, path };

export const routeHandler: RouteHandler<PostRunnerLockTryAcquire, AuthLocals> = {
    ...route,
    validate,
    handler
};
