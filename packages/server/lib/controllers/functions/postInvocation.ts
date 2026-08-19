import tracer from 'dd-trace';
import { z } from 'zod';

import db from '@nangohq/database';
import { logContextGetter, OtlpSpan } from '@nangohq/logs';
import { connectionService, functionConfigService, validateFunctionInput } from '@nangohq/shared';
import { report, requireEmptyQuery, truncateJson, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema, scriptNameSchema } from '../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { DBFunctionConfigVersion, FunctionInvocationType, PostFunctionInvocation } from '@nangohq/types';

const bodyValidation = z
    .object({
        connection_id: connectionIdSchema,
        integration_id: providerConfigKeySchema,
        name: scriptNameSchema,
        input: z.unknown().optional(),
        invocation_type: z.enum(['wait', 'no_wait'] satisfies FunctionInvocationType[]),
        // TODO: Validate options based on function config
        // Ex: scheduled functions can have variant, functions with models can have clear cache, etc...
        // For now we just accept any options without using them yet.
        options: z.record(z.string(), z.any()).optional()
    })
    .strict();

export const postFunctionInvocation = asyncWrapperWithEnvironment<PostFunctionInvocation>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const bodyValidationResult = bodyValidation.safeParse(req.body);
    if (!bodyValidationResult.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(bodyValidationResult.error) } });
        return;
    }

    const body: PostFunctionInvocation['Body'] = bodyValidationResult.data;

    const connectionRes = await connectionService.getConnection(body.connection_id, body.integration_id, res.locals.environment.id);

    if (!connectionRes.success) {
        res.status(404).send({
            error: {
                code: 'connection_not_found',
                message: `Connection '${body.connection_id}' was not found for integration '${body.integration_id}'`
            }
        });
        return;
    }

    const functionRes = await functionConfigService.search(db.knex, {
        environmentId: res.locals.environment.id,
        filter: { integrationKey: body.integration_id, name: body.name }
    });

    if (functionRes.isErr()) {
        report(functionRes.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to find function' } });
        return;
    }

    if (functionRes.value.length !== 1) {
        res.status(404).send({ error: { code: 'unknown_function', message: `Function '${body.name}' was not found` } });
        return;
    }

    if (!functionRes.value[0]?.config.enabled) {
        res.status(403).send({ error: { code: 'function_disabled', message: 'Function is disabled' } });
        return;
    }

    const { currentVersion, integration, config } = functionRes.value[0];

    if (!supportInvocation(currentVersion, body.invocation_type)) {
        res.status(400).send({ error: { code: 'invalid_invocation', message: `Function '${body.name}' is not invokable with ${body.invocation_type}` } });
        return;
    }

    const { input, ...rest } = body;

    const validation = validateFunctionInput(currentVersion, input);

    if (validation.isErr()) {
        res.status(400).send({ error: { code: 'validation_error', message: validation.error.message, errors: validation.error.validationErrors } });
        return;
    }

    return tracer.trace('server.function.invocation', async (span) => {
        span.addTags(rest);

        const timeoutMs =
            rest.invocation_type === 'wait'
                ? 2 * 60 * 1000 // 2 minutes for synchronous invocations
                : 24 * 60 * 60 * 1000; // 24 hours for asynchronous invocations
        const connection = connectionRes.response!;

        const logCtx = await logContextGetter.create(
            { operation: { type: 'function', action: 'invoke' }, expiresAt: new Date(Date.now() + timeoutMs).toISOString() },
            {
                account: res.locals.account,
                environment: res.locals.environment,
                integration: { id: integration.id, name: integration.unique_key, provider: integration.provider },
                connection: { id: connection.id, name: connection.connection_id },
                syncConfig: { id: currentVersion.id, name: config.name },
                meta: {
                    invocation_type: rest.invocation_type,
                    ...(rest.options ? { options: rest.options } : {}),
                    ...(input ? { input: truncateJson(input) } : {})
                }
            }
        );
        logCtx.attachSpan(new OtlpSpan(logCtx.operation));

        void logCtx.failed();
        res.status(501).send({ error: { code: 'not_implemented', message: 'Function invocation is not implemented yet' } });
    });
});

function supportInvocation(version: DBFunctionConfigVersion, invocationType: FunctionInvocationType): boolean {
    const supported: Record<DBFunctionConfigVersion['trigger']['kind'], FunctionInvocationType[]> = {
        http: ['wait', 'no_wait'],
        schedule: ['no_wait'],
        event: ['no_wait'],
        none: []
    };
    return supported[version.trigger.kind]?.includes(invocationType) ?? false;
}
