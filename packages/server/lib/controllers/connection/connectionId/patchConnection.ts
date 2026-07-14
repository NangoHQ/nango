import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { handlePatchConnection, patchConnectionBodySchema } from '../../shared/connections/patchConnection.js';

import type { PatchPublicConnection } from '@nangohq/types';

const queryStringValidation = z.strictObject({
    provider_config_key: providerConfigKeySchema
});

const paramValidation = z.strictObject({
    connectionId: connectionIdSchema
});

export const patchPublicConnection = asyncWrapper<PatchPublicConnection>(async (req, res) => {
    const queryParamValues = queryStringValidation.safeParse(req.query);
    if (!queryParamValues.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(queryParamValues.error) } });
        return;
    }

    const valBody = patchConnectionBodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    const { environment, account } = res.locals;
    const queryParams: PatchPublicConnection['Querystring'] = queryParamValues.data;
    const params: PatchPublicConnection['Params'] = paramValue.data;

    await handlePatchConnection({
        res,
        account,
        environment,
        connectionId: params.connectionId,
        providerConfigKey: queryParams.provider_config_key,
        body: valBody.data
    });
});
