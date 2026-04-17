import { configService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { invokeCompiler } from '../../../services/remote-function/compiler-client.js';
import { RemoteFunctionError, sendStepError } from '../../../services/remote-function/helpers.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { remoteFunctionCompileBodySchema } from '../validation.js';

import type { PostRemoteFunctionCompile } from '@nangohq/types';

export const postRemoteFunctionCompile = asyncWrapper<PostRemoteFunctionCompile>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = remoteFunctionCompileBodySchema.safeParse(req.body);
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
            error: err,
            ...(err instanceof RemoteFunctionError ? {} : { status: 500 })
        });
    }
});
