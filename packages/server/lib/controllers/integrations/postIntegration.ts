import * as z from 'zod';

import { configService, getProvider, sharedCredentialsService } from '@nangohq/shared';
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

import type { DBCreateIntegration, PostPublicIntegration, PostPublicQuickstartIntegration } from '@nangohq/types';

const baseValidationBody = z
    .object({
        provider: providerSchema,
        unique_key: providerConfigKeySchema,
        display_name: integrationDisplayNameSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema
    })
    .strict();

const validationBody = baseValidationBody.extend({
    credentials: integrationCredentialsSchema.optional()
});

const quickstartAuthModes = new Set(['OAUTH1', 'OAUTH2']);

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
        forward_webhooks: body.forward_webhooks ?? true,
        shared_credentials_id: null
    };

    if (creds) {
        switch (creds.type) {
            case 'OAUTH1':
            case 'OAUTH2': {
                newIntegration.oauth_client_id = creds.client_id;
                newIntegration.oauth_client_secret = creds.client_secret;
                newIntegration.oauth_scopes = creds.scopes;
                if (creds.webhook_secret) {
                    newIntegration.custom = { webhookSecret: creds.webhook_secret };
                }
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

export const postPublicQuickstartIntegration = asyncWrapper<PostPublicQuickstartIntegration>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = baseValidationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment } = res.locals;
    const body: PostPublicQuickstartIntegration['Body'] = valBody.data;
    const provider = getProvider(body.provider);
    if (!provider) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['provider'] }] }
        });
        return;
    }

    if (!quickstartAuthModes.has(provider.auth_mode)) {
        res.status(400).send({
            error: { code: 'invalid_body', message: 'Quickstart is only available for providers that require a developer app' }
        });
        return;
    }

    const exists = await configService.getProviderConfig(body.unique_key, environment.id);
    if (exists) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Unique key already exists', path: ['uniqueKey'] }] }
        });
        return;
    }

    const sharedCredentials = await sharedCredentialsService.getLatestSharedCredentialsByName(body.provider);
    if (sharedCredentials.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to load Nango-provided developer app' } });
        return;
    }

    if (!sharedCredentials.value) {
        res.status(400).send({
            error: { code: 'invalid_body', message: 'No Nango-provided developer app is configured for this provider' }
        });
        return;
    }

    const newIntegration: DBCreateIntegration = {
        environment_id: environment.id,
        provider: body.provider,
        display_name: body.display_name || null,
        unique_key: body.unique_key,
        custom: null,
        missing_fields: [],
        forward_webhooks: body.forward_webhooks ?? true,
        shared_credentials_id: sharedCredentials.value.id
    };

    const result = await configService.createProviderConfig(newIntegration, provider);
    if (!result) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to create integration' } });
        return;
    }

    res.status(200).send({
        data: integrationToPublicApi({ integration: result, provider })
    });
});
