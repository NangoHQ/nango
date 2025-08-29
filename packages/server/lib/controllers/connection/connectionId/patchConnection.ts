import * as z from 'zod';

import db from '@nangohq/database';
import { EndUserMapper, configService, connectionService, linkConnection, upsertEndUser } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { connectionIdSchema, endUserSchema, providerConfigKeySchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PatchPublicConnection } from '@nangohq/types';

const schemaBody = z.strictObject({
    end_user: endUserSchema.optional()
});

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

    const { environment, account } = res.locals;

    const queryParams: PatchPublicConnection['Querystring'] = queryParamValues.data;
    const params: PatchPublicConnection['Params'] = paramValue.data;
    const body: PatchPublicConnection['Body'] = valBody.data;

    const integration = await configService.getProviderConfig(queryParams.provider_config_key, environment.id);
    if (!integration) {
        res.status(400).send({ error: { code: 'unknown_provider_config', message: 'Provider does not exists' } });
        return;
    }

    const connectionRes = await connectionService.getConnection(params.connectionId, queryParams.provider_config_key, environment.id);
    if (connectionRes.error || !connectionRes.response) {
        res.status(404).send({ error: { code: 'not_found', message: 'Failed to find connection' } });
        return;
    }

    const connection = connectionRes.response;

    if (body.end_user) {
        await db.knex.transaction(async (trx) => {
            const endUserRes = await upsertEndUser(trx, { account, environment, connection, endUser: EndUserMapper.apiToEndUser(body.end_user!) });
            if (endUserRes.isErr()) {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to update end user' } });
                return;
            }

            if (!connection.end_user_id) {
                await linkConnection(trx, { endUserId: endUserRes.value.id, connection });
            }
        });
    }

    res.status(200).send({ success: true });
});
