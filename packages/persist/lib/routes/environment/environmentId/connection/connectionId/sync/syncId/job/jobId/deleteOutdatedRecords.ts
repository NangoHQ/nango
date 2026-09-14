import z from 'zod';

import { logContextGetter, operationIdRegex } from '@nangohq/logs';
import { records } from '@nangohq/records';
import { connectionService, updateSyncJobResult } from '@nangohq/shared';
import { stringifyError, validateRequest } from '@nangohq/utils';

import { pubsub } from '../../../../../../../../../pubsub.js';

import type { AuthLocals } from '../../../../../../../../../middleware/auth.middleware.js';
import type { ApiError, DeleteOutdatedRecordsSuccess, Endpoint } from '@nangohq/types';
import type { EndpointRequest, EndpointResponse, Route, RouteHandler } from '@nangohq/utils';

type DeleteOutdatedRecords = Endpoint<{
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
        activityLogId: string;
    };
    Error: ApiError<'delete_outdated_records_failed'>;
    Success: DeleteOutdatedRecordsSuccess;
}>;

const path = '/environment/:environmentId/connection/:nangoConnectionId/sync/:syncId/job/:syncJobId/outdated';
const method = 'DELETE';

const bodySchema = z
    .object({
        model: z.string(),
        activityLogId: operationIdRegex
    })
    .strict();
const paramsSchema = z
    .object({
        environmentId: z.coerce.number().int().positive(),
        nangoConnectionId: z.coerce.number().int().positive(),
        syncId: z.string(),
        syncJobId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
    })
    .strict();

const validate = validateRequest<DeleteOutdatedRecords>({
    parseBody: (data: unknown) => bodySchema.parse(data),
    parseParams: (data: unknown) => paramsSchema.parse(data)
});

// TODO: remove once we have a single code path, i.e. once runner/lambda are fully deployed
// with the streaming-aware client.
function supportsStreaming(req: EndpointRequest): boolean {
    return (req.get('accept') ?? '').includes('application/x-ndjson');
}

const handler = async (req: EndpointRequest, res: EndpointResponse<DeleteOutdatedRecords, AuthLocals>) => {
    const { nangoConnectionId, syncId, syncJobId, environmentId } = res.locals.parsedParams;
    const { model, activityLogId } = res.locals.parsedBody;
    const { account, environment, plan } = res.locals;
    const logCtx = logContextGetter.getStateLess({ id: String(activityLogId), accountId: account.id });
    const streaming = supportsStreaming(req);

    const sendError = (message: string) => {
        const error = { code: 'delete_outdated_records_failed' as const, message };
        if (streaming) {
            res.write(`${JSON.stringify({ status: 'error', error })}\n`);
        } else {
            res.status(500).json({ error });
        }
    };
    const sendDone = (deletedKeys: string[]) => {
        if (streaming) {
            res.write(`${JSON.stringify({ status: 'done', deletedKeys })}\n`);
        } else {
            res.status(200).json({ deletedKeys });
        }
    };

    if (streaming) {
        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.flushHeaders();
    }

    try {
        const result = await records.deleteOutdatedRecords({
            environmentId,
            connectionId: nangoConnectionId,
            model,
            generation: syncJobId,
            plan,
            ...(streaming && {
                onProgress: ({ deleted, page }: { deleted: number; page: number }) => {
                    if (res.destroyed || res.writableEnded) {
                        return;
                    }
                    res.write(`${JSON.stringify({ status: 'in_progress', deleted, page })}\n`);
                }
            })
        });

        if (result.isErr()) {
            void logCtx.error(`Failed to delete outdated records for model ${model}`, { error: result.error });
            sendError(`Failed to delete outdated records: ${result.error.message}`);
            return;
        }

        const deleted = result.value.length;
        const syncJobResultUpdate = {
            [model]: {
                added: 0,
                updated: 0,
                deleted
            }
        };
        await updateSyncJobResult(syncJobId, syncJobResultUpdate, model);
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
        void logCtx.info(`Deleted ${result.value.length} outdated records for model ${model}`, { deletedKeys: result.value });
        sendDone(result.value);
    } catch (err) {
        void logCtx.error(`Failed to delete outdated records for model ${model}`, { error: err });
        sendError(`Failed to delete outdated records: ${stringifyError(err)}`);
    } finally {
        res.end();
    }
    return;
};

export const route: Route<DeleteOutdatedRecords> = { path, method };

export const routeHandler: RouteHandler<DeleteOutdatedRecords, AuthLocals> = {
    method,
    path,
    validate,
    handler
};
