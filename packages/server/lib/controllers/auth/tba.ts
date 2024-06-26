import { z } from 'zod';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { zodErrorToHTTP } from '@nangohq/utils';
import type { TbaAuthorization } from '@nangohq/types';

const bodyValidation = z
    .object({
        token_id: z.string().nonempty(),
        token_secret: z.string().nonempty()
    })
    .strict();

const queryStringValidation = z
    .object({
        connection_id: z.string().nonempty(),
        params: z.record(z.any()).optional(),
        authorization_params: z.record(z.any()).optional(),
        user_scope: z.string().optional(),
        public_key: z.string().uuid(),
        hmac: z.string().optional()
    })
    .strict();

const paramValidation = z
    .object({
        providerConfigKey: z.string().nonempty()
    })
    .strict();

export const tbaAuthorization = asyncWrapper<TbaAuthorization>(async (req, res) => {
    const val = bodyValidation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const queryStringVal = queryStringValidation.safeParse(req.query);

    if (!queryStringVal.success) {
        res.status(400).send({
            error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryStringVal.error) }
        });
        return;
    }
    const paramVal = paramValidation.safeParse(req.params);

    if (!paramVal.success) {
        res.status(400).send({
            error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramVal.error) }
        });
        return;
    }

    const { environment } = res.locals;

    const body: Required<TbaAuthorization['Body']> = val.data;

    const { token_id: tokenId, token_secret: tokenSecret } = body;
    const { connection_id: connectionId, params } = queryStringVal.data;
    const { providerConfigKey } = paramVal.data;

    console.log(environment, tokenId, tokenSecret, params);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    res.status(201).send({ connectionId, providerConfigKey });
});
