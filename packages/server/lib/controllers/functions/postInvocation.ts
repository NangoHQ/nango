import { z } from 'zod';

import db from '@nangohq/database';
import { connectionService, functionConfigService, validateFunctionInput } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema, scriptNameSchema } from '../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { DBFunctionConfigVersion, FunctionInvocationType, PostFunctionInvocation } from '@nangohq/types';

const bodyValidation = z
    .object({
        connection_id: connectionIdSchema,
        integration_id: providerConfigKeySchema,
        name: scriptNameSchema,
        input: z.unknown().optional(),
        invocation_type: z.enum(['RequestResponse', 'Async'] satisfies FunctionInvocationType[]),
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

    const { currentVersion } = functionRes.value[0];

    if (!supportInvocation(currentVersion, body.invocation_type)) {
        res.status(400).send({ error: { code: 'invalid_invocation', message: `Function '${body.name}' is not invokable with ${body.invocation_type}` } });
        return;
    }

    const validation = validateFunctionInput(currentVersion, body.input);

    if (validation.isErr()) {
        res.status(400).send({ error: { code: 'validation_error', message: validation.error.message, errors: validation.error.validationErrors } });
        return;
    }

    res.status(501).send({ error: { code: 'not_implemented', message: 'Function invocation is not implemented yet' } });
});

function supportInvocation(version: DBFunctionConfigVersion, invocationType: FunctionInvocationType): boolean {
    const supported: Record<DBFunctionConfigVersion['trigger']['kind'], FunctionInvocationType[]> = {
        http: ['RequestResponse', 'Async'],
        schedule: ['Async'],
        event: ['Async'],
        none: []
    };
    return supported[version.trigger.kind]?.includes(invocationType) ?? false;
}
