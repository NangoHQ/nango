import db from '@nangohq/database';
import { deleteCheckpoint } from '@nangohq/shared';
import { validateRequest } from '@nangohq/utils';

import { deleteCheckpointRequestParser } from './validate.js';

import type { AuthLocals } from '../../../../../../middleware/auth.middleware.js';
import type { ApiError, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type DeleteCheckpoint = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Body: {
        key: string;
        expectedVersion: number;
    };
    Error: ApiError<'delete_checkpoint_failed' | 'checkpoint_conflict'>;
    Success: never;
}>;

const path = '/environment/:environmentId/connection/:nangoConnectionId/checkpoint';
const method = 'DELETE';

const validate = validateRequest<DeleteCheckpoint>(deleteCheckpointRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<DeleteCheckpoint, AuthLocals>) => {
    const {
        parsedParams: { nangoConnectionId, environmentId },
        parsedBody: { key, expectedVersion }
    } = res.locals;

    const result = await deleteCheckpoint(db.knex, { environmentId, connectionId: nangoConnectionId, key, expectedVersion });

    if (result.isErr()) {
        if (result.error.message === 'checkpoint_conflict') {
            res.status(409).json({ error: { code: 'checkpoint_conflict', message: 'Checkpoint has been updated since last read' } });
            return;
        }
        res.status(500).json({ error: { code: 'delete_checkpoint_failed', message: `Failed to delete checkpoint: ${result.error.message}` } });
        return;
    }

    res.status(204).send();
};

export const route: Route<DeleteCheckpoint> = { path, method };

export const routeHandler: RouteHandler<DeleteCheckpoint, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
