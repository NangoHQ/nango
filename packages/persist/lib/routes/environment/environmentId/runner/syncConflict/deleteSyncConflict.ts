import { validateRequest } from '@nangohq/utils';

import * as coordination from '../../../../../coordination/index.js';
import { environmentIdParamsSchema, syncConflictBodySchema } from '../validate.js';

import type { AuthLocals } from '../../../../../middleware/auth.middleware.js';
import type { DeleteSyncConflict } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

const path = '/environment/:environmentId/runner/sync-conflict';
const method = 'DELETE';

const validate = validateRequest<DeleteSyncConflict>({
    parseParams: (data) => environmentIdParamsSchema.parse(data),
    parseBody: (data) => syncConflictBodySchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<DeleteSyncConflict, AuthLocals>) => {
    const {
        parsedParams: { environmentId },
        parsedBody: { scriptType, syncId }
    } = res.locals;

    const result = await coordination.releaseSyncConflict({ environmentId, scriptType, syncId });
    if (result.isErr()) {
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
