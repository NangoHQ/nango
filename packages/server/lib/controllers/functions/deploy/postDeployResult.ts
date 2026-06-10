import {
    cleanupFunctionSandbox,
    getFunctionDeploymentRow,
    markFunctionDeploymentFailed,
    markFunctionDeploymentSuccess,
    parseDeploySuccessOutput
} from '@nangohq/sandbox';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { normalizeFunctionErrorCode } from '../errors.js';
import { functionDeploymentParamsSchema, functionDeploymentResultBodySchema } from '../validation.js';
import { toFunctionDeploymentError, verifyDeploymentResultSandboxToken } from './helpers.js';

import type { PostFunctionDeploymentResult } from '@nangohq/types';

export const postFunctionDeploymentResult = asyncWrapper<PostFunctionDeploymentResult>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valParams = functionDeploymentParamsSchema.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    if (!verifyDeploymentResultSandboxToken(res, valParams.data.id)) {
        return;
    }

    const valBody = functionDeploymentResultBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment } = res.locals;
    const current = await getFunctionDeploymentRow({ environmentId: environment.id, id: valParams.data.id });
    if (!current) {
        res.status(404).send({ error: { code: 'deployment_not_found', message: `Deployment '${valParams.data.id}' was not found` } });
        return;
    }

    if (current.status === 'success' || current.status === 'failed') {
        res.status(200).send({ ok: true });
        await cleanupFunctionSandbox({ sandboxId: current.sandbox_id });
        return;
    }

    const body = valBody.data;
    if (body.status === 'success') {
        try {
            const output = parseDeploySuccessOutput(body.output);
            await markFunctionDeploymentSuccess({
                environmentId: environment.id,
                id: current.id,
                output: output.output,
                deployed: output.deployed,
                deployedFunctions: output.deployedFunctions,
                durationMs: body.duration_ms
            });
        } catch (err) {
            await markFunctionDeploymentFailed({
                environmentId: environment.id,
                id: current.id,
                output: body.output,
                durationMs: body.duration_ms,
                error: toFunctionDeploymentError(err)
            });
        }
    } else {
        await markFunctionDeploymentFailed({
            environmentId: environment.id,
            id: current.id,
            output: body.output,
            durationMs: body.duration_ms,
            error: {
                code: normalizeFunctionErrorCode(body.error.code, 'deployment_error'),
                message: body.error.message,
                ...(body.error.payload !== undefined ? { payload: body.error.payload } : {})
            }
        });
    }

    res.status(200).send({ ok: true });
    await cleanupFunctionSandbox({ sandboxId: current.sandbox_id });
});
