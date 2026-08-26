import { z } from 'zod';

import { invokeFunction } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema, scriptNameSchema } from '../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../utils/utils.js';
import { sendFunctionFailure } from './errors.js';

import type { FunctionInvocationType, PostFunctionInvocation } from '@nangohq/types';

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

    const body = bodyValidation.safeParse(req.body);
    if (!body.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(body.error) } });
        return;
    }

    const invoke = await invokeFunction({
        account: res.locals.account,
        environment: res.locals.environment,
        integrationId: body.data.integration_id,
        connectionId: body.data.connection_id,
        functionName: body.data.name,
        input: body.data.input,
        invocationType: body.data.invocation_type,
        options: body.data.options,
        orchestrator: getOrchestrator()
    });

    if (invoke.isOk()) {
        if ('statusUrl' in invoke.value) {
            res.status(202).location(invoke.value.statusUrl).json(invoke.value);
            return;
        }
        res.status(200).json(invoke.value.data as PostFunctionInvocation['Success']);
        return;
    }

    switch (invoke.error.code) {
        case 'connection_not_found':
        case 'function_not_found':
            res.status(404).send({ error: { code: invoke.error.code, message: invoke.error.message } });
            return;
        case 'function_disabled':
            res.status(403).send({ error: { code: invoke.error.code, message: invoke.error.message } });
            return;
        case 'invalid_invocation':
            res.status(400).send({ error: { code: invoke.error.code, message: invoke.error.message } });
            return;
        case 'validation_error':
            res.status(400).send({ error: { code: invoke.error.code, message: invoke.error.message, errors: invoke.error.errors } });
            return;
        case 'function_failed':
            sendFunctionFailure({ res, cause: invoke.error.cause, message: invoke.error.message, errorToReport: invoke.error });
            return;
        case 'server_error':
            report(invoke.error);
            res.status(500).send({ error: { code: invoke.error.code, message: invoke.error.message } });
            return;
        default:
            return ((_exhaustiveCheck: never) => {
                res.status(500).send({ error: { code: 'server_error', message: 'Unknown invocation failure' } });
            })(invoke.error.code);
    }
});
