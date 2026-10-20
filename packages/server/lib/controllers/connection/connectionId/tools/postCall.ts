import tracer from 'dd-trace';
import * as z from 'zod';

import db from '@nangohq/database';
import { configService, connectionService, errorManager, invokeFunction, toolService } from '@nangohq/shared';
import { getHeaders, metrics, redactHeaders, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema, scriptNameSchema } from '../../../../helpers/validation.js';
import { executeAction } from '../../../../services/action.service.js';
import { asyncWrapperWithEnvironment } from '../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../utils/utils.js';
import { sendFunctionInvocationResult } from '../../../functions/invocation.js';

import type { PostToolCall } from '@nangohq/types';

const paramsSchema = z.object({ connectionId: connectionIdSchema, name: scriptNameSchema }).strict();
const headersSchema = z.object({ 'provider-config-key': providerConfigKeySchema.optional() });
const bodySchema = z.object({ input: z.unknown().optional() }).strict();

export const postToolCall = asyncWrapperWithEnvironment<PostToolCall>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }
    const headers = headersSchema.safeParse(req.headers);
    if (!headers.success) {
        res.status(400).send({ error: { code: 'invalid_headers', errors: zodErrorToHTTP(headers.error) } });
        return;
    }
    const body = bodySchema.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const { account, environment } = res.locals;
    const { connectionId, name } = params.data;
    const providerConfigKey = headers.data['provider-config-key'];

    const connections = await connectionService.search(db.knex, {
        environmentId: environment.id,
        filter: { connectionId, integrationId: providerConfigKey },
        limit: 2
    });
    if (connections.isErr()) {
        report(connections.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch connection' } });
        return;
    }
    const [connection, other] = connections.value;
    if (!connection) {
        res.status(404).send({ error: { code: 'connection_not_found', message: `Connection '${connectionId}' was not found` } });
        return;
    }
    if (other) {
        res.status(400).send({
            error: {
                code: 'ambiguous_connection',
                message: 'Multiple integrations have this connection ID. Supply the provider-config-key header.'
            }
        });
        return;
    }
    const integrationId = connection.provider_config_key;

    const integration = await configService.getProviderConfig(integrationId, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'connection_not_found', message: `Connection '${connectionId}' was not found` } });
        return;
    }

    const resolved = await toolService.resolveTool({ accountUuid: account.uuid, environmentId: environment.id, integration, name });
    if (resolved.isErr()) {
        report(resolved.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to fetch tool' } });
        return;
    }

    const { input } = body.data;
    const tool = resolved.value;
    if (tool.kind === 'missing') {
        res.status(404).send({ error: { code: 'function_not_found', message: `Tool '${name}' was not found` } });
        return;
    }
    if (tool.kind === 'function') {
        const result = await invokeFunction({
            account,
            environment,
            connectionId,
            functionUuid: tool.fn.config.uuid,
            input,
            request: { method: 'POST', path: req.path, headers: redactHeaders({ headers: getHeaders(req.headers) }), query: {} },
            invocationType: 'wait',
            orchestrator: getOrchestrator()
        });
        sendFunctionInvocationResult({ res, result });
        return;
    }

    metrics.increment(metrics.Types.ACTION_INCOMING_PAYLOAD_SIZE_BYTES, req.rawBody ? Buffer.byteLength(req.rawBody) : 0, { accountId: account.id });

    await tracer.trace<Promise<void>>('service.tool.call.fallback', async (span) => {
        const { logCtx, result } = await executeAction({
            account,
            environment,
            connectionId,
            providerConfigKey: integrationId,
            actionName: name,
            input,
            isAsync: false,
            retryMax: 0,
            span
        });
        if (result.isOk()) {
            if ('data' in result.value) {
                res.status(200).json(result.value.data);
            } else {
                res.status(500).send({ error: { code: 'server_error', message: 'Unexpected async action response' } });
            }
        } else {
            const { code, message, nangoError } = result.error;
            if (code === 'unknown_connection' || code === 'unknown_provider') {
                res.status(404).send({ error: { code: 'connection_not_found', message } });
            } else if (code === 'unknown_action') {
                res.status(404).send({ error: { code: 'function_not_found', message } });
            } else if (code === 'disabled_action') {
                res.status(403).send({ error: { code: 'function_disabled', message } });
            } else if (code === 'action_failed' && nangoError && nangoError.type !== 'action_script_failure' && nangoError.type !== 'action_failure') {
                errorManager.errResFromNangoErr(res, nangoError);
            } else if (code === 'action_failed' && nangoError?.type === 'action_script_failure') {
                res.status(500).send({ error: { code: 'function_failed', message, payload: nangoError.payload } });
            } else if (code === 'action_failed') {
                report(result.error);
                res.status(500).send({ error: { code: 'function_failed', message } });
            } else {
                report(result.error);
                res.status(500).send({ error: { code: 'server_error', message } });
            }
        }
        await logCtx?.enrichOperation({
            request: {
                url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
                method: req.method,
                headers: redactHeaders({ headers: getHeaders(req.headers) })
            },
            response: { code: res.statusCode, headers: redactHeaders({ headers: getHeaders(res.getHeaders()) }) }
        });
    });
});
