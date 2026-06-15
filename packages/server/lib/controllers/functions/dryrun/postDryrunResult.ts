import { getFunctionDryrunRow, markFunctionDryrunFailed, markFunctionDryrunSuccess, parseDryrunSuccessOutput, sandboxService } from '@nangohq/sandbox';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { normalizeFunctionErrorCode } from '../errors.js';
import { functionDryrunParamsSchema, functionDryrunResultBodySchema } from '../validation.js';
import { toFunctionDryrunError, verifyDryrunResultSandboxToken } from './helpers.js';

import type { PostFunctionDryrunResult } from '@nangohq/types';

export const postFunctionDryrunResult = asyncWrapper<PostFunctionDryrunResult>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = functionDryrunParamsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    if (!verifyDryrunResultSandboxToken(res, valParams.data.id)) {
        return;
    }

    const valBody = functionDryrunResultBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment } = res.locals;
    const current = await getFunctionDryrunRow({ environmentId: environment.id, id: valParams.data.id });
    if (!current) {
        res.status(404).send({ error: { code: 'dryrun_not_found', message: `Dryrun '${valParams.data.id}' was not found` } });
        return;
    }

    if (current.status === 'success' || current.status === 'failed') {
        res.status(200).send({ ok: true });
        await sandboxService.cleanup({ sandboxId: current.sandbox_id });
        return;
    }

    const body = valBody.data;
    if (body.status === 'success') {
        try {
            const output = parseDryrunSuccessOutput(body.output);
            await markFunctionDryrunSuccess({
                environmentId: environment.id,
                id: current.id,
                output: output.output,
                result: output.result,
                hasResult: output.hasResult,
                durationMs: body.duration_ms
            });
        } catch (err) {
            await markFunctionDryrunFailed({
                environmentId: environment.id,
                id: current.id,
                output: body.output,
                durationMs: body.duration_ms,
                error: toFunctionDryrunError(err)
            });
        }
    } else {
        await markFunctionDryrunFailed({
            environmentId: environment.id,
            id: current.id,
            output: body.output,
            durationMs: body.duration_ms,
            error: {
                code: normalizeFunctionErrorCode(body.error.code),
                message: body.error.message,
                ...(body.error.payload !== undefined ? { payload: body.error.payload } : {})
            }
        });
    }

    res.status(200).send({ ok: true });
    await sandboxService.cleanup({ sandboxId: current.sandbox_id });
});
