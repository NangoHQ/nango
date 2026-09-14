import z from 'zod';

import { records } from '@nangohq/records';
import { connectionService } from '@nangohq/shared';
import { stringifyError, validateRequest } from '@nangohq/utils';

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
        syncJobId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)
    })
    .strict();

const validate = validateRequest<DeleteHardRecords>({
    parseBody: (data: unknown) => bodySchema.parse(data),
    parseParams: (data: unknown) => paramsSchema.parse(data)
});

// TODO: remove once we have a single code path, i.e. once runner/lambda are fully deployed
// with the streaming-aware client.
function supportsStreaming(req: EndpointRequest): boolean {
    return (req.get('accept') ?? '').includes('application/x-ndjson');
}

const handler = async (req: EndpointRequest, res: EndpointResponse<DeleteHardRecords, AuthLocals>) => {
    const { nangoConnectionId, environmentId, syncId } = res.locals.parsedParams;
    const { model } = res.locals.parsedBody;
    const { account, environment, plan } = res.locals;
    const limit = envs.PERSIST_HARD_DELETE_LIMIT;
    const streaming = supportsStreaming(req);

    const sendError = (message: string) => {
        const error = { code: 'hard_delete_records_failed' as const, message };
        if (streaming) {
            res.write(`${JSON.stringify({ status: 'error', error })}\n`);
        } else {
            res.status(500).json({ error });
        }
    };
    const sendDone = (deletedCount: number, hasMore: boolean) => {
        if (streaming) {
            res.write(`${JSON.stringify({ status: 'done', deletedCount, hasMore })}\n`);
        } else {
            res.status(200).json({ deletedCount, hasMore });
        }
    };

    if (streaming) {
        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.flushHeaders();
    }

    try {
        const result = await records.deleteRecords({
            connectionId: nangoConnectionId,
            environmentId,
            model,
            mode: 'hard',
            limit,
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
            sendError(`Failed to hard delete records: ${result.error.message}`);
            return;
        }

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
        sendDone(result.value.count, result.value.count === limit);
    } catch (err) {
        sendError(`Failed to hard delete records: ${stringifyError(err)}`);
    } finally {
        res.end();
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
