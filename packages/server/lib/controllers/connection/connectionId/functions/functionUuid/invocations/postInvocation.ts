import { z } from 'zod';

import { invokeFunction } from '@nangohq/shared';
import { getHeaders, redactHeaders, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema } from '../../../../../../helpers/validation.js';
import { asyncWrapperWithEnvironment } from '../../../../../../utils/asyncWrapper.js';
import { getOrchestrator } from '../../../../../../utils/utils.js';
import { sendFunctionInvocationResult } from '../../../../../functions/invocation.js';

import type { FunctionInvocationType, PostFunctionInvocation } from '@nangohq/types';

const bodyValidation = z
    .object({
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

    const params = z.object({ connectionId: connectionIdSchema, functionUuid: z.uuid() }).safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const invoke = await invokeFunction({
        account: res.locals.account,
        environment: res.locals.environment,
        connectionId: params.data.connectionId,
        functionUuid: params.data.functionUuid,
        input: body.data.input,
        request: {
            method: 'POST',
            path: req.path,
            headers: redactHeaders({ headers: getHeaders(req.headers) }),
            query: {}
        },
        invocationType: body.data.invocation_type,
        options: body.data.options,
        orchestrator: getOrchestrator()
    });

    sendFunctionInvocationResult({ res, result: invoke });
});
