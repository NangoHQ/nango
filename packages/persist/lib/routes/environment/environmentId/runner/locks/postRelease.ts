import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../coordination/index.js';
import { logger } from '../../../../../logger.js';
import { environmentIdParamsSchema, lockOwnerKeyBodySchema } from '../validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { PostRunnerLockRelease } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/locks/release';
const method = 'POST';

const validate = validateRequest<PostRunnerLockRelease>({
    parseParams: (data) => environmentIdParamsSchema.parse(data),
    parseBody: (data) => lockOwnerKeyBodySchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PostRunnerLockRelease, AuthLocals>) => {
    const {
        parsedParams: { environmentId },
        parsedBody: { owner, key }
    } = res.locals;

    const result = await coordination.releaseLock({ namespace: environmentId, owner, key });
    if (result.isErr()) {
        logger.error('Failed to release lock', { owner, key, error: result.error });
        res.status(500).json({ error: { code: 'release_lock_failed', message: result.error.message } });
        return;
    }

    res.json({ released: result.value });
};

export const route: Route<PostRunnerLockRelease> = { method, path };

export const routeHandler: RouteHandler<PostRunnerLockRelease, AuthLocals> = {
    ...route,
    validate,
    handler
};
