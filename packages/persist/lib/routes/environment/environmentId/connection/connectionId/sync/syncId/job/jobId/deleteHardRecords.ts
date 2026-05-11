import z from 'zod';

import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { validateRequest } from '@nangohq/utils';

import { envs } from '../../../../../../../../../env.js';
import { pubsub } from '../../../../../../../../../pubsub.js';

import type { AuthLocals } from '../../../../../../../../../middleware/auth.middleware.js';
import type { ApiError, DeleteHardAllRecordsSuccess, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type DeleteHardRecords = Endpoint<{
    Method: typeof method;
    Path: typeof path;
    Params: {
        environmentId: number;
        nangoConnectionId: number;
        syncId: string;
        syncJobId: number;
    };
    Body: {
        model: string;
    };
    Error: ApiError<'hard_delete_records_failed'>;
    Success: DeleteHardAllRecordsSuccess;
}>;

const path = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/records/hard';
const method = 'DELETE';

const bodySchema = z
    .object({
        model: z.string()
    })
    .strict();
const paramsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive(),
        syncId: z.string(),
        syncJobId: z.coerce.number().int().positive()
    })
    .strict();

const validate = validateRequest<DeleteHardRecords>({
    parseBody: (data: unknown) => bodySchema.parse(data),
    parseParams: (data: unknown) => paramsSchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<DeleteHardRecords, AuthLocals>) => {
    const { nangoConnectionId, environmentId, syncId } = res.locals.parsedParams;
    const { model } = res.locals.parsedBody;
    const { account, environment } = res.locals;
    const limit = envs.PERSIST_HARD_DELETE_LIMIT;
    const result = await records.deleteRecords({
        connectionId: nangoConnectionId,
        environmentId,
        model,
        mode: 'hard',
        limit
    });
    if (result.isOk()) {
        if (result.value.count > 0) {
            const connection = await connectionService.getConnectionById(nangoConnectionId);
            void pubsub.publisher.publish({
                subject: 'usage',
                type: 'usage.records',
                payload: {
                    value: -result.value.count,
                    properties: {
                        accountId: account.id,
                        environmentId: environment.id,
                        environmentName: environment.name,
                        integrationId: connection?.provider_config_key || 'unknown',
                        connectionId: connection?.connection_id || 'unknown',
                        syncId,
                        model
                    }
                }
            });
        }

        res.status(200).json({ deletedCount: result.value.count, hasMore: result.value.count === limit });
    } else {
        res.status(500).json({ error: { code: 'hard_delete_records_failed', message: `Failed to hard delete records: ${result.error.message}` } });
    }
    return;
};

export const route: Route<DeleteHardRecords> = { path, method };

export const routeHandler: RouteHandler<DeleteHardRecords, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
