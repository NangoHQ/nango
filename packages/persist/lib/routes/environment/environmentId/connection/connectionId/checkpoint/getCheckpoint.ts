import db from '@nangohq/database';
import { getCheckpoint } from '@nangohq/shared';
import { validateRequest } from '@nangohq/utils';

import { getCheckpointRequestParser } from './validate.js';

import type { AuthLocals } from '../../../../../../middleware/auth.middleware.js';
import type { ApiError, Endpoint, GetCheckpointSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type GetCheckpoint = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Querystring: {
        key: string;
    };
    Error: ApiError<'get_checkpoint_failed' | 'checkpoint_not_found'>;
    Success: GetCheckpointSuccess;
}>;

const path = '/environment/:environmentId/connection/:nangoConnectionId/checkpoint';
const method = 'GET';

const validate = validateRequest<GetCheckpoint>(getCheckpointRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<GetCheckpoint, AuthLocals>) => {
    const {
        parsedParams: { nangoConnectionId, environmentId },
        parsedQuery: { key }
    } = res.locals;

    const result = await getCheckpoint(db.knex, { environmentId, connectionId: nangoConnectionId, key });

    if (result.isErr()) {
        res.status(500).json({ error: { code: 'get_checkpoint_failed', message: `Failed to get checkpoint: ${result.error.message}` } });
        return;
    }

    const checkpoint = result.value;
    if (!checkpoint) {
        res.status(404).json({ error: { code: 'checkpoint_not_found', message: `Checkpoint not found` } });
        return;
    }

    res.json({
        checkpoint: checkpoint.checkpoint,
        version: checkpoint.version,
        deletedAt: checkpoint.deleted_at?.toISOString() || null
    });
};

export const route: Route<GetCheckpoint> = { path, method };

export const routeHandler: RouteHandler<GetCheckpoint, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
