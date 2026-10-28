import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { logContextGetter } from '@nangohq/logs';
import { errorManager, functionConfigService, invokeFunction, SyncCommand, syncManager } from '@nangohq/shared';
import { getHeaders, metrics, redactHeaders, report, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../utils/utils.js';
import { runAction } from '../../action/runAction.js';
import { sendFunctionInvocationResult } from '../../functions/invocation.js';
import { normalizeSyncParams } from '../../sync/helpers.js';

import type { PostInternalInvokeFunction } from '@nangohq/types';

const bodySchema = z.discriminatedUnion('type', [
    z.strictObject({
        type: z.literal('tool'),
        function_name: syncNameSchema,
        provider_config_key: providerConfigKeySchema,
        connection_id: connectionIdSchema,
        input: z.unknown().optional()
    }),
    z.strictObject({
        type: z.literal('action'),
        function_name: syncNameSchema,
        provider_config_key: providerConfigKeySchema,
        connection_id: connectionIdSchema,
        input: z.unknown().optional()
    }),
    z.strictObject({
        type: z.literal('sync'),
        function_name: syncNameSchema,
        provider_config_key: providerConfigKeySchema,
        connection_id: connectionIdSchema
    })
]);

const orchestrator = getOrchestrator();

export const postInvokeFunction = asyncWrapperWithEnvironment<PostInternalInvokeFunction>(async (req, res) => {
    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const { type, function_name, provider_config_key, connection_id } = valBody.data;

    if (type === 'tool') {
        const functions = await functionConfigService.search(db.knex, {
            environmentId: environment.id,
            filter: { integrationKey: provider_config_key, name: function_name, trigger: { kind: 'http' } }
        });
        if (functions.isErr()) {
            report(functions.error);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch tool' } });
            return;
        }
        const fn = functions.value[0];
        if (!fn) {
            res.status(404).send({ error: { code: 'function_not_found', message: `Tool '${function_name}' was not found` } });
            return;
        }
        const result = await invokeFunction({
            account,
            environment,
            connectionId: connection_id,
            functionUuid: fn.config.uuid,
            input: valBody.data.input,
            request: { method: 'POST', path: req.path, headers: redactHeaders({ headers: getHeaders(req.headers) }), query: {} },
            invocationType: 'wait',
            orchestrator
        });
        sendFunctionInvocationResult({ res, result });
        return;
    }

    if (type === 'action') {
        const { input } = valBody.data;

        metrics.increment(metrics.Types.ACTION_INCOMING_PAYLOAD_SIZE_BYTES, req.rawBody ? Buffer.byteLength(req.rawBody) : 0, { accountId: account.id });

        await tracer.trace<Promise<void>>('server.trigger.action', async (span) => {
            const logCtx = await runAction({
                account: account,
                environment: environment,
                connectionId: connection_id,
                providerConfigKey: provider_config_key,
                actionName: function_name,
                input,
                isAsync: false,
                retryMax: 0,
                res,
                span
            });

            const reqHeaders = getHeaders(req.headers);
            const responseHeaders = getHeaders(res.getHeaders());
            await logCtx?.enrichOperation({
                request: {
                    url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
                    method: req.method,
                    headers: redactHeaders({ headers: reqHeaders })
                },
                response: {
                    code: res.statusCode,
                    headers: redactHeaders({ headers: responseHeaders })
                }
            });
        });
    } else {
        const syncIdentifiers = normalizeSyncParams([function_name]);

        const { success, error } = await syncManager.runSyncCommand({
            orchestrator,
            environment: environment,
            providerConfigKey: provider_config_key,
            syncIdentifiers,
            command: SyncCommand.RUN,
            logContextGetter,
            connectionId: connection_id,
            initiator: 'UI'
        });

        if (!success) {
            errorManager.errResFromNangoErr(res, error);
            return;
        }

        res.status(200).send({ success: true });
    }
});
