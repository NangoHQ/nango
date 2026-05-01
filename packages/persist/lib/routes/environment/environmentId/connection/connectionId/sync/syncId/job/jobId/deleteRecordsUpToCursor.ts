import z from 'zod';

import { logContextGetter, operationIdRegex } from '@nangohq/logs';
import { records } from '@nangohq/records';
import { connectionService, updateSyncJobResult } from '@nangohq/shared';
import { validateRequest } from '@nangohq/utils';

import { pubsub } from '../../../../../../../../../pubsub.js';

import type { AuthLocals } from '../../../../../../../../../middleware/auth.middleware.js';
import type { ApiError, DeleteRecordsUpToCursorSuccess, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type DeleteRecordsUpToCursor = Endpoint<{
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
        cursor: string;
        activityLogId: string;
    };
    Error: ApiError<'delete_records_up_to_cursor_failed'> | ApiError<'invalid_cursor_value'>;
    Success: DeleteRecordsUpToCursorSuccess;
}>;

const path = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/records/up-to-cursor';
const method = 'DELETE';

const bodySchema = z
    .object({
        model: z.string(),
        cursor: z.string().min(1),
        activityLogId: operationIdRegex
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

const validate = validateRequest<DeleteRecordsUpToCursor>({
    parseBody: (data: unknown) => bodySchema.parse(data),
    parseParams: (data: unknown) => paramsSchema.parse(data)
});

const handler = async (_req: EndpointRequest, res: EndpointResponse<DeleteRecordsUpToCursor, AuthLocals>) => {
    const { nangoConnectionId, syncId, syncJobId } = res.locals.parsedParams;
    const { model, cursor, activityLogId } = res.locals.parsedBody;
    const { account, environment } = res.locals;
    const logCtx = logContextGetter.getStateLess({ id: String(activityLogId), accountId: account.id });
    const baseModel = model.split('::')[0] || model;

    const result = await records.deleteRecords({
        environmentId: environment.id,
        connectionId: nangoConnectionId,
        model,
        mode: 'soft',
        toCursorIncluded: cursor
    });

    if (result.isOk()) {
        const deleted = result.value.count;
        const syncJobResultUpdate = {
            [baseModel]: {
                added: 0,
                updated: 0,
                deleted
            }
        };
        await updateSyncJobResult(syncJobId, syncJobResultUpdate, baseModel);
        if (deleted > 0) {
            const connection = await connectionService.getConnectionById(nangoConnectionId);
            void pubsub.publisher.publish({
                subject: 'usage',
                type: 'usage.records',
                payload: {
                    value: -deleted,
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
        void logCtx.info(`Deleted ${deleted} records up to cursor for model ${model}`, { deletedCount: deleted });
        res.status(200).json({ deletedCount: deleted });
        return;
    }

    const errMessage = result.error.message;
    if (errMessage === 'invalid_cursor_value') {
        void logCtx.error(`Invalid cursor for delete-up-to-cursor on model ${model}`, { error: result.error });
        res.status(400).json({ error: { code: 'invalid_cursor_value', message: 'Invalid cursor' } });
        return;
    }

    void logCtx.error(`Failed to delete records up to cursor for model ${model}`, { error: result.error });
    res.status(500).json({
        error: { code: 'delete_records_up_to_cursor_failed', message: `Failed to delete records up to cursor: ${result.error.message}` }
    });
};

export const route: Route<DeleteRecordsUpToCursor> = { path, method };

export const routeHandler: RouteHandler<DeleteRecordsUpToCursor, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
