import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, envSchema, providerConfigKeySchema } from '../../../../helpers/validation.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { handlePostConnectionMetadata } from '../../../shared/connections/postConnectionMetadata.js';

import type { PostConnectionMetadata } from '@nangohq/types';

const schemaBody = z.strictObject({
    metadata: z.record(z.string(), z.unknown())
});

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

export const postConnectionMetadata = asyncWrapper<PostConnectionMetadata>(async (req, res) => {
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

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment } = res.locals;

    await handlePostConnectionMetadata({
        res,
        environment,
        connectionId: valParams.data.connectionId,
        providerConfigKey: valQuery.data.provider_config_key,
        metadata: valBody.data.metadata
    });
});
