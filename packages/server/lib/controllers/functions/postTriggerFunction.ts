import * as z from 'zod';

import { OtlpSpan, defaultOperationExpiration, logContextGetter } from '@nangohq/logs';
import { configService, connectionService, getFunctionConfigRaw } from '@nangohq/shared';
import { requireEmptyQuery, truncateJson, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';

import type { ConnectionJobs, PostPublicTriggerFunction } from '@nangohq/types';

// Functions run on the customer's runner quota; this bounds concurrent runs per environment.
const FUNCTION_MAX_CONCURRENCY = 50;

const schemaHeaders = z.object({
    'provider-config-key': providerConfigKeySchema,
    'connection-id': connectionIdSchema.optional()
});

const schemaBody = z.object({
    function_name: z.string().min(1).max(255),
    payload: z.unknown()
});

export const postPublicTriggerFunction = asyncWrapper<PostPublicTriggerFunction>(async (req, res) => {
    const valHeaders = schemaHeaders.safeParse(req.headers);
    if (!valHeaders.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(valHeaders.error) } });
        return;
    }

    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const { function_name, payload } = valBody.data;
    const providerConfigKey = valHeaders.data['provider-config-key'];
    const connectionId = valHeaders.data['connection-id'];

    const provider = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!provider) {
        res.status(400).json({ error: { code: 'unknown_provider', message: 'Failed to find provider' } });
        return;
    }

    const syncConfig = await getFunctionConfigRaw({ environmentId: environment.id, config_id: provider.id!, name: function_name });
    if (!syncConfig) {
        res.status(404).json({ error: { code: 'not_found', message: 'Function not found' } });
        return;
    }
    if (!syncConfig.enabled) {
        res.status(404).json({ error: { code: 'disabled_resource', message: 'The function is disabled' } });
        return;
    }

    // Connection is optional: a connection-bound run when provided, a connection-less routing run otherwise.
    let connection: ConnectionJobs | null = null;
    if (connectionId) {
        const { success, response: conn } = await connectionService.getConnection(connectionId, providerConfigKey, environment.id);
        if (!success || !conn) {
            res.status(400).json({ error: { code: 'unknown_connection', message: 'Failed to find connection' } });
            return;
        }
        connection = { id: conn.id, connection_id: conn.connection_id, provider_config_key: conn.provider_config_key, environment_id: conn.environment_id };
    }

    const logCtx = await logContextGetter.create(
        { operation: { type: 'action', action: 'run' }, expiresAt: defaultOperationExpiration.action() },
        {
            account,
            environment,
            integration: { id: provider.id!, name: providerConfigKey, provider: provider.provider },
            syncConfig: { id: syncConfig.id, name: syncConfig.sync_name },
            ...(connection ? { connection: { id: connection.id, name: connection.connection_id } } : {}),
            meta: truncateJson({ payload })
        }
    );
    logCtx.attachSpan(new OtlpSpan(logCtx.operation));

    const result = await getOrchestrator().triggerFunction<{ taskId: string; retryKey: string }>({
        functionName: function_name,
        providerConfigKey,
        environmentId: environment.id,
        connection,
        trigger: { type: 'manual', name: null },
        input: (payload ?? {}) as object,
        maxConcurrency: FUNCTION_MAX_CONCURRENCY,
        logCtx
    });

    if (result.isErr()) {
        await logCtx.failed();
        res.status(500).json({ error: { code: 'trigger_failed', message: result.error.message } });
        return;
    }

    res.status(200).json({ taskId: result.value.taskId });
});
