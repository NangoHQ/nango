import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { handleReplaceConnectionConfig, replaceConnectionConfigBodySchema } from '../../../shared/connections/replaceConnectionConfig.js';

import type { PatchConnectionConfig } from '@nangohq/types';

const validationQuery = z
    .object({
        provider_config_key: providerConfigKeySchema,
        env: envSchema
    })
    .strict();

const validationParams = z
    .object({
        connectionId: connectionIdSchema
    })
    .strict();

export const patchConnectionConfig = asyncWrapper<PatchConnectionConfig>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const valBody = replaceConnectionConfigBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment } = res.locals;

    await handleReplaceConnectionConfig({
        res,
        environment,
        connectionId: valParams.data.connectionId,
        providerConfigKey: valQuery.data.provider_config_key,
        connectionConfig: valBody.data.connection_config
    });
});
