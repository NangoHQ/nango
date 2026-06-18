import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../coordination/index.js';
import { environmentIdParamsSchema, releaseAllLocksBodySchema } from '../validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { PostRunnerLockReleaseAll } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/locks/release-all';
const method = 'POST';

const validate = validateRequest<PostRunnerLockReleaseAll>({
    parseParams: (data) => environmentIdParamsSchema.parse(data),
    parseBody: (data) => releaseAllLocksBodySchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PostRunnerLockReleaseAll, AuthLocals>) => {
    const {
        parsedBody: { owner }
    } = res.locals;

    const result = await coordination.releaseAllLocks({ owner });
    if (result.isErr()) {
        res.status(500).json({ error: { code: 'release_all_locks_failed', message: result.error.message } });
        return;
    }

    res.status(204).send();
};

export const route: Route<PostRunnerLockReleaseAll> = { method, path };

export const routeHandler: RouteHandler<PostRunnerLockReleaseAll, AuthLocals> = {
    ...route,
    validate,
    handler
};
