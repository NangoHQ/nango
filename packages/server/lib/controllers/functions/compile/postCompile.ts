import { z } from 'zod';

import { configService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { CompilerError, invokeCompiler } from '../../../services/remote-function/compiler-client.js';
import { sendStepError } from '../../../services/remote-function/helpers.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostRemoteFunctionCompile } from '@nangohq/types';

const bodySchema = z
    .object({
        integration_id: z.string().min(1),
        function_name: z.string().min(1),
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1)
    })
    .strict();

export const postRemoteFunctionCompile = asyncWrapper<PostRemoteFunctionCompile>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { environment } = res.locals;

    const providerConfig = await configService.getProviderConfig(body.integration_id, environment.id);
    if (!providerConfig) {
        res.status(404).send({ error: { code: 'integration_not_found', message: `Integration '${body.integration_id}' was not found` } });
        return;
    }

    try {
        const result = await invokeCompiler({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code
        });

        res.status(200).send({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            bundle_size_bytes: result.bundleSizeBytes,
            bundled_js: result.bundledJs,
            compiled_at: new Date().toISOString()
        });
    } catch (err) {
        sendStepError({
            res,
            step: 'compilation',
            error: err,
            status: err instanceof CompilerError ? 400 : 500
        });
    }
});
