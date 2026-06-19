import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../coordination/index.js';
import { logger } from '../../../../../logger.js';
import { environmentIdParamsSchema, syncConflictBodySchema } from '../validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { PutSyncConflict } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/sync-conflict';
const method = 'PUT';

const validate = validateRequest<PutSyncConflict>({
    parseParams: (data) => environmentIdParamsSchema.parse(data),
    parseBody: (data) => syncConflictBodySchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<PutSyncConflict, AuthLocals>) => {
    const {
        parsedParams: { environmentId },
        parsedBody: { scriptType, syncId, refresh }
    } = res.locals;

    const result = await coordination.acquireSyncConflict({ environmentId, scriptType, syncId, refresh: refresh ?? false });
    if (result.isErr()) {
        if (result.error.message === 'Conflicting sync detected') {
            res.status(409).json({ error: { code: 'sync_conflict', message: result.error.message } });
            return;
        }
        logger.error('Failed to acquire sync conflict', { environmentId, scriptType, syncId, error: result.error });
        res.status(500).json({ error: { code: 'put_sync_conflict_failed', message: result.error.message } });
        return;
    }

    res.status(204).send();
};

export const route: Route<PutSyncConflict> = { method, path };

export const routeHandler: RouteHandler<PutSyncConflict, AuthLocals> = {
    ...route,
    validate,
    handler
};
