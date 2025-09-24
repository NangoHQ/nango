import * as z from 'zod';

import { configService, connectionService, getProvider } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { validationParams } from './getIntegration.js';
import { integrationToPublicApi } from '../../../formatters/integration.js';
import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema
} from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PatchPublicIntegration } from '@nangohq/types';

const validationBody = z
    .object({
        unique_key: providerConfigKeySchema.optional(),
        display_name: integrationDisplayNameSchema.optional(),
        credentials: integrationCredentialsSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema
    })
    .strict();

export const patchPublicIntegration = asyncWrapper<PatchPublicIntegration>(async (req, res) => {
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

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environment } = res.locals;
    const body: PatchPublicIntegration['Body'] = valBody.data;
    const params: PatchPublicIntegration['Params'] = valParams.data;
    const integration = await configService.getProviderConfig(params.uniqueKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'not_found', message: `Integration "${params.uniqueKey}" does not exist` } });
        return;
    }

    const provider = getProvider(integration.provider);
    if (!provider) {
        res.status(404).send({ error: { code: 'not_found', message: `Unknown provider ${integration.provider}` } });
        return;
    }

    if (body.credentials && body.credentials.type !== provider.auth_mode) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'incompatible credentials auth type and provider auth' } });
        return;
    }

    // Integration ID
    if (body.unique_key) {
        const exists = await configService.getIdByProviderConfigKey(environment.id, body.unique_key);
        if (exists && exists !== integration.id) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'uniqueKey is already used by another integration' } });
            return;
        }

        const count = await connectionService.countConnections({ environmentId: environment.id, providerConfigKey: params.uniqueKey });
        if (count > 0) {
            res.status(400).send({ error: { code: 'invalid_body', message: "Can't rename an integration with active connections" } });
            return;
        }

        integration.unique_key = body.unique_key;
    }

    // Custom display name
    if (body.display_name) {
        integration.display_name = body.display_name;
    }

    // Forward webhooks
    if ('forward_webhooks' in body && body.forward_webhooks !== undefined) {
        integration.forward_webhooks = body.forward_webhooks;
    }

    // Credentials
    // maybe to sync with postIntegration
    const creds = body.credentials;
    if (creds) {
        switch (creds.type) {
            case 'OAUTH1':
            case 'OAUTH2': {
                integration.oauth_client_id = creds.client_id;
                integration.oauth_client_secret = creds.client_secret;
                integration.oauth_scopes = creds.scopes;
                break;
            }

            case 'APP': {
                integration.oauth_client_id = creds.app_id;
                integration.oauth_client_secret = Buffer.from(creds.private_key).toString('base64');
                integration.app_link = creds.app_link;
                break;
            }

            case 'CUSTOM': {
                integration.oauth_client_id = creds.client_id;
                integration.oauth_client_secret = creds.client_secret;
                integration.app_link = creds.app_link;
                // This is a legacy thing
                integration.custom = { app_id: creds.app_id, private_key: Buffer.from(creds.private_key).toString('base64') };
                break;
            }

            default: {
                throw new Error('Unsupported auth type');
            }
        }
    }

    // webhook secrets
    if (body.credentials?.type === 'OAUTH2' && 'webhook_secret' in body.credentials) {
        if (body.credentials.webhook_secret) {
            integration.custom = integration.custom || {};
            integration.custom['webhookSecret'] = body.credentials.webhook_secret;
        } else {
            delete integration.custom?.['webhookSecret'];
        }
    }
    const update = await configService.editProviderConfig(integration, provider);
    res.status(200).send({
        data: integrationToPublicApi({ integration: update, provider })
    });
});
