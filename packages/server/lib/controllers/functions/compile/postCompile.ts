import { RemoteFunctionError, invokeCompiler } from '@nangohq/sandbox';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { sendStepError } from '../errors.js';
import { functionCompileBodySchema } from '../validation.js';

import type { PostFunctionCompile } from '@nangohq/types';

export const postFunctionCompile = asyncWrapper<PostFunctionCompile>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = functionCompileBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;

    try {
        const result = await invokeCompiler({
            code: body.code
        });

        res.status(200).send({
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
