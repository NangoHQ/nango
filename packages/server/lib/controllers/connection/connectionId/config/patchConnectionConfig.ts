import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionConfigParamsSchema, connectionIdSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { handleReplaceConnectionConfig } from '../../../shared/connections/replaceConnectionConfig.js';

import type { PatchPublicConnectionConfig } from '@nangohq/types';

const schemaBody = z.strictObject({
    connection_config: connectionConfigParamsSchema
});

const queryStringValidation = z.strictObject({
    provider_config_key: providerConfigKeySchema
});

const paramValidation = z.strictObject({
    connectionId: connectionIdSchema
});

export const patchPublicConnectionConfig = asyncWrapper<PatchPublicConnectionConfig>(async (req, res) => {
    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) } });
        return;
    }

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    const { environment } = res.locals;

    await handleReplaceConnectionConfig({
        res,
        environment,
        connectionId: paramValue.data.connectionId,
        providerConfigKey: queryParamValues.data.provider_config_key,
        connectionConfig: valBody.data.connection_config ?? {}
    });
});
