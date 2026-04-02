import { z } from 'zod';

import db from '@nangohq/database';
import { connectionService, getApiUrl, secretService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { invokeDryrun } from '../../../services/remote-function/dryrun-client.js';
import { sendStepError } from '../../../services/remote-function/helpers.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostRemoteFunctionDryrun } from '@nangohq/types';

const bodySchema = z
    .object({
        integration_id: z.string().min(1),
        function_name: z.string().min(1),
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1),
        connection_id: z.string().min(1),
        input: z.unknown().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        checkpoint: z.record(z.string(), z.unknown()).optional(),
        last_sync_date: z.string().datetime().optional()
    })
    .strict();

export const postRemoteFunctionDryrun = asyncWrapper<PostRemoteFunctionDryrun>(async (req, res) => {
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

    const connectionResult = await connectionService.getConnection(body.connection_id, body.integration_id, environment.id);
    if (!connectionResult.success || !connectionResult.response) {
        sendStepError({
            res,
            step: 'lookup',
            status: 404,
            error: { type: 'connection_not_found', message: `Connection '${body.connection_id}' was not found for integration '${body.integration_id}'` }
        });
        return;
    }

    const defaultSecret = await secretService.getDefaultSecretForEnv(db.readOnly, environment.id);
    if (defaultSecret.isErr()) {
        sendStepError({ res, step: 'lookup', status: 500, error: defaultSecret.error });
        return;
    }

    const startedAt = new Date();

    const result = await invokeDryrun({
        integration_id: body.integration_id,
        function_name: body.function_name,
        function_type: body.function_type,
        code: body.code,
        environment_name: environment.name,
        connection_id: body.connection_id,
        nango_secret_key: defaultSecret.value.secret,
        nango_host: getApiUrl(),
        ...(body.input !== undefined ? { input: body.input } : {}),
        ...(body.metadata ? { metadata: body.metadata } : {}),
        ...(body.checkpoint ? { checkpoint: body.checkpoint } : {}),
        ...(body.last_sync_date ? { last_sync_date: body.last_sync_date } : {})
    });

    const durationMs = Date.now() - startedAt.getTime();

    res.status(200).send({
        integration_id: body.integration_id,
        function_name: body.function_name,
        function_type: body.function_type,
        execution_timeout_at: new Date(startedAt.getTime() + 5 * 60 * 1000).toISOString(),
        duration_ms: durationMs,
        output: result.output
    });
});
