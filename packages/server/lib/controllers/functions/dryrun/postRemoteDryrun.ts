import { RemoteFunctionError, invokeDryrun, parseDryrunSuccessOutput } from '@nangohq/sandbox';
import { connectionService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { sendStepError } from '../errors.js';
import { remoteFunctionDryrunBodySchema } from '../validation.js';
import { createDryrunSandboxApiKey, requireCustomerKeyId } from './helpers.js';
import { getFunctionSandboxNangoHost } from '../requestHost.js';

import type { PostRemoteFunctionDryrun } from '@nangohq/types';

export const postRemoteFunctionDryrun = asyncWrapper<PostRemoteFunctionDryrun>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = remoteFunctionDryrunBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body = valBody.data;
    const { environment } = res.locals;

    const connectionResult = await connectionService.getConnection(body.connection_id, body.integration_id, environment.id);
    if (!connectionResult.success || !connectionResult.response) {
        sendStepError({
            res,
            status: 404,
            error: { type: 'connection_not_found', message: `Connection '${body.connection_id}' was not found for integration '${body.integration_id}'` }
        });
        return;
    }

    const parentCustomerKeyId = requireCustomerKeyId(res, 'Sandbox tokens can only be issued from a customer API key');
    if (!parentCustomerKeyId) {
        return;
    }

    const sandboxApiKey = await createDryrunSandboxApiKey(parentCustomerKeyId, environment.id);
    if (sandboxApiKey.isErr()) {
        sendStepError({ res, status: 500, error: sandboxApiKey.error });
        return;
    }

    const startedAt = new Date();

    try {
        const nangoHost = getFunctionSandboxNangoHost(req);
        const result = await invokeDryrun({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            connection_id: body.connection_id,
            nango_secret_key: sandboxApiKey.value,
            nango_host: nangoHost,
            ...(body.input !== undefined ? { input: body.input } : {}),
            ...(body.metadata ? { metadata: body.metadata } : {}),
            ...(body.checkpoint ? { checkpoint: body.checkpoint } : {}),
            ...(body.last_sync_date ? { last_sync_date: body.last_sync_date } : {})
        });

        const durationMs = Date.now() - startedAt.getTime();
        const dryrunOutput = parseDryrunSuccessOutput(result.output);

        res.status(200).send({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            duration_ms: durationMs,
            ...(dryrunOutput.hasResult ? { result: dryrunOutput.result } : {})
        });
    } catch (err) {
        sendStepError({ res, error: err, ...(err instanceof RemoteFunctionError ? {} : { status: 500 }) });
    }
});
