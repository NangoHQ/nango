import db from '@nangohq/database';
import { upsertCheckpoint } from '@nangohq/shared';
import { validateRequest } from '@nangohq/utils';

import { putCheckpointRequestParser } from './validate.js';

import type { AuthLocals } from '../../../../../../middleware/auth.middleware.js';
import type { ApiError, Checkpoint, Endpoint, PutCheckpointSuccess } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type PutCheckpoint = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
    };
    Body: {
        key: string;
        checkpoint: Checkpoint;
        expectedVersion: number;
    };
    Error: ApiError<'put_checkpoint_failed' | 'checkpoint_conflict'>;
    Success: PutCheckpointSuccess;
}>;

const path = '/environment/:environmentId/connection/:nangoConnectionId/checkpoint';
const method = 'PUT';

const validate = validateRequest<PutCheckpoint>(putCheckpointRequestParser);

const handler = async (_req: EndpointRequest, res: EndpointResponse<PutCheckpoint, AuthLocals>) => {
    const {
        parsedParams: { nangoConnectionId, environmentId },
        parsedBody: { key, checkpoint, expectedVersion }
    } = res.locals;

    const result = await upsertCheckpoint(db.knex, {
        environmentId,
        connectionId: nangoConnectionId,
        key,
        checkpoint,
        expectedVersion
    });

    if (result.isErr()) {
        if (result.error.message === 'checkpoint_conflict') {
            res.status(409).json({ error: { code: 'checkpoint_conflict', message: 'Checkpoint has been updated since last read' } });
            return;
        }
        res.status(500).json({ error: { code: 'put_checkpoint_failed', message: `Failed to save checkpoint: ${result.error.message}` } });
        return;
    }

    res.json({ checkpoint: result.value.checkpoint, version: result.value.version });
};

export const route: Route<PutCheckpoint> = { path, method };

export const routeHandler: RouteHandler<PutCheckpoint, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
