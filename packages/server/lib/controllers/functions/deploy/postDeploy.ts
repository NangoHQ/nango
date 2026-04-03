import { z } from 'zod';

import db from '@nangohq/database';
import { configService, getApiUrl, getSyncConfigRaw, secretService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { invokeDeploy } from '../../../services/remote-function/deploy-client.js';
import { sendStepError } from '../../../services/remote-function/helpers.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostRemoteFunctionDeploy } from '@nangohq/types';

const bodySchema = z
    .object({
        integration_id: z.string().min(1),
        function_name: z.string().min(1),
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1)
    })
    .strict();

export const postRemoteFunctionDeploy = asyncWrapper<PostRemoteFunctionDeploy>(async (req, res) => {
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
    if (!providerConfig || !providerConfig.id) {
        res.status(404).send({ error: { code: 'integration_not_found', message: `Integration '${body.integration_id}' was not found` } });
        return;
    }

    // Guard: refuse to overwrite pre-built or public functions
    // TODO: once agent-generated functions have a distinct identifier, relax this check to allow overwriting agent functions only
    const existingSyncConfig = await getSyncConfigRaw({
        environmentId: environment.id,
        config_id: providerConfig.id,
        name: body.function_name,
        isAction: body.function_type === 'action'
    });
    if (existingSyncConfig && (existingSyncConfig.is_public || existingSyncConfig.pre_built)) {
        res.status(400).send({
            error: {
                code: 'invalid_request',
                message: `Cannot overwrite pre-built function '${body.function_name}'`
            }
        });
        return;
    }

    const defaultSecret = await secretService.getDefaultSecretForEnv(db.readOnly, environment.id);
    if (defaultSecret.isErr()) {
        sendStepError({ res, step: 'deployment', status: 500, error: defaultSecret.error });
        return;
    }

    const result = await invokeDeploy({
        integration_id: body.integration_id,
        function_name: body.function_name,
        function_type: body.function_type,
        code: body.code,
        nango_secret_key: defaultSecret.value.secret,
        nango_host: getApiUrl()
    });

    res.status(200).send({
        integration_id: body.integration_id,
        function_name: body.function_name,
        function_type: body.function_type,
        output: result.output
    });
});
