import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../coordination/index.js';
import { logger } from '../../../../../logger.js';
import { deleteSyncConflictBodySchema, environmentIdParamsSchema } from '../validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { DeleteSyncConflict } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/sync-conflict';
const method = 'DELETE';

const validate = validateRequest<DeleteSyncConflict>({
    parseParams: (data) => environmentIdParamsSchema.parse(data),
    parseBody: (data) => deleteSyncConflictBodySchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<DeleteSyncConflict, AuthLocals>) => {
    const {
        parsedParams: { environmentId },
        parsedBody: { scriptType, syncId }
    } = res.locals;

    const result = await coordination.releaseSyncConflict({ environmentId, scriptType, syncId });
    if (result.isErr()) {
        logger.error('Failed to release sync conflict', { environmentId, scriptType, syncId, error: result.error });
        res.status(500).json({ error: { code: 'delete_sync_conflict_failed', message: result.error.message } });
        return;
    }

    res.status(204).send();
};

export const route: Route<DeleteSyncConflict> = { method, path };

export const routeHandler: RouteHandler<DeleteSyncConflict, AuthLocals> = {
    ...route,
    validate,
    handler
};
