import db from '@nangohq/database';
import { connectionService, secretService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { parseDryrunSuccessOutput } from '../../../services/remote-function/command-output.js';
import { invokeDryrun } from '../../../services/remote-function/dryrun-client.js';
import { RemoteFunctionError, sendStepError } from '../../../services/remote-function/helpers.js';
import { getRemoteFunctionNangoHost } from '../../../services/remote-function/runtime.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { remoteFunctionDryrunBodySchema } from '../validation.js';

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

    const defaultSecret = await secretService.getDefaultSecretForEnv(db.readOnly, environment.id);
    if (defaultSecret.isErr()) {
        sendStepError({ res, status: 500, error: defaultSecret.error });
        return;
    }

    const startedAt = new Date();

    try {
        const result = await invokeDryrun({
            integration_id: body.integration_id,
            function_name: body.function_name,
            function_type: body.function_type,
            code: body.code,
            environment_name: environment.name,
            connection_id: body.connection_id,
            nango_secret_key: defaultSecret.value.secret,
            nango_host: getRemoteFunctionNangoHost(),
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
            execution_timeout_at: new Date(startedAt.getTime() + 5 * 60 * 1000).toISOString(),
            duration_ms: durationMs,
            ...(dryrunOutput.hasResult ? { result: dryrunOutput.result } : {})
        });
    } catch (err) {
        sendStepError({ res, error: err, ...(err instanceof RemoteFunctionError ? {} : { status: 500 }) });
    }
});
