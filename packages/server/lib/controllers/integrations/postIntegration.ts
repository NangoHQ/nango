import * as z from 'zod';

import { configService, getProvider } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToPublicApi } from '../../formatters/integration.js';
import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema,
    providerSchema
} from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { DBCreateIntegration, PostPublicIntegration } from '@nangohq/types';

const validationBody = z
    .object({
        provider: providerSchema,
        unique_key: providerConfigKeySchema,
        display_name: integrationDisplayNameSchema.optional(),
        credentials: integrationCredentialsSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema
    })
    .strict();

export const postPublicIntegration = asyncWrapper<PostPublicIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment } = res.locals;
    const body: PostPublicIntegration['Body'] = valBody.data;
    const provider = getProvider(body.provider);
    if (!provider) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['provider'] }] }
        });
        return;
    }

    if (body.credentials && body.credentials.type !== provider.auth_mode) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'incompatible credentials auth type and provider auth' } });
        return;
    } else if (
        !body.credentials &&
        (provider.auth_mode === 'OAUTH1' || provider.auth_mode === 'OAUTH2' || provider.auth_mode === 'APP' || provider.auth_mode === 'CUSTOM')
    ) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Missing credentials' } });
        return;
    }

    const exists = await configService.getProviderConfig(body.unique_key, environment.id);
    if (exists) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Unique key already exists', path: ['uniqueKey'] }] }
        });
        return;
    }

    const creds = body.credentials;

    const newIntegration: DBCreateIntegration = {
        environment_id: environment.id,
        provider: body.provider,
        display_name: body.display_name || null,
        unique_key: body.unique_key,
        custom: null,
        missing_fields: [],
        forward_webhooks: body.forward_webhooks ?? true
    };

    if (creds) {
        switch (creds.type) {
            case 'OAUTH1':
            case 'OAUTH2': {
                newIntegration.oauth_client_id = creds.client_id;
                newIntegration.oauth_client_secret = creds.client_secret;
                newIntegration.oauth_scopes = creds.scopes;
                break;
            }

            case 'APP': {
                newIntegration.oauth_client_id = creds.app_id;
                newIntegration.oauth_client_secret = Buffer.from(creds.private_key).toString('base64');
                newIntegration.app_link = creds.app_link;
                break;
            }

            case 'CUSTOM': {
                newIntegration.oauth_client_id = creds.client_id;
                newIntegration.oauth_client_secret = creds.client_secret;
                newIntegration.app_link = creds.app_link;
                // This is a legacy thing
                newIntegration.custom = { app_id: creds.app_id, private_key: Buffer.from(creds.private_key).toString('base64') };
                break;
            }

            default: {
                throw new Error('Unsupported auth type');
            }
        }
    }

    const result = await configService.createProviderConfig(newIntegration, provider);
    if (!result) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to create integration' } });
        return;
    }

    res.status(200).send({
        data: integrationToPublicApi({ integration: result, provider })
    });
});
