import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToPublicApi } from '../../formatters/integration.js';
import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema,
    providerSchema
} from '../../helpers/validation.js';
import integrationService from '../../services/integration.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { IntegrationServiceError } from '../../services/integration.service.js';
import type { PostPublicIntegration, PostPublicQuickstartIntegration } from '@nangohq/types';
import type { Response } from 'express';

const baseValidationBody = z
    .object({
        provider: providerSchema,
        unique_key: providerConfigKeySchema,
        display_name: integrationDisplayNameSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema
    })
    .strict();

const validationBody = baseValidationBody.extend({
    credentials: integrationCredentialsSchema.optional(),
    integration_config: z.record(z.string(), z.string().max(8192)).optional()
});

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
    const result = await integrationService.create({
        environmentId: environment.id,
        provider: body.provider,
        uniqueKey: body.unique_key,
        credentialSource: 'own',
        displayName: body.display_name,
        forwardWebhooks: body.forward_webhooks,
        credentials: body.credentials,
        integrationConfig: body.integration_config
    });
    if (result.isErr()) {
        sendCreateIntegrationError(res, result.error);
        return;
    }

    res.status(200).send({
        data: integrationToPublicApi(result.value)
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
    const result = await integrationService.create({
        environmentId: environment.id,
        provider: body.provider,
        uniqueKey: body.unique_key,
        credentialSource: 'nango',
        displayName: body.display_name,
        forwardWebhooks: body.forward_webhooks
    });
    if (result.isErr()) {
        sendCreateIntegrationError(res, result.error);
        return;
    }

    res.status(200).send({
        data: integrationToPublicApi(result.value)
    });
});

function sendCreateIntegrationError(res: Response, error: IntegrationServiceError): void {
    const code = error.code;
    switch (code) {
        case 'invalid_provider':
            res.status(400).send({
                error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Invalid provider', path: ['provider'] }] }
            });
            return;
        case 'integration_exists':
            res.status(400).send({
                error: { code: 'invalid_body', errors: [{ code: 'invalid_string', message: 'Unique key already exists', path: ['uniqueKey'] }] }
            });
            return;
        case 'incompatible_credentials':
            res.status(400).send({ error: { code: 'invalid_body', message: 'incompatible credentials auth type and provider auth' } });
            return;
        case 'missing_credentials':
            res.status(400).send({ error: { code: 'invalid_body', message: 'Missing credentials' } });
            return;
        case 'nango_credentials_unsupported':
            res.status(400).send({
                error: { code: 'invalid_body', message: 'Quickstart is only available for providers that require a developer app' }
            });
            return;
        case 'shared_credentials_not_found':
            res.status(400).send({
                error: { code: 'invalid_body', message: 'No Nango-provided developer app is configured for this provider' }
            });
            return;
        case 'invalid_integration_config':
            res.status(400).send({ error: { code: 'invalid_body', message: error.message } });
            return;
        case 'shared_credentials_load_failed':
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to load Nango-provided developer app' } });
            return;
        case 'create_failed':
        case 'list_failed':
        case 'get_failed':
        case 'not_found':
        case 'integration_has_connections':
        case 'custom_not_allowed':
        case 'update_failed':
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create integration' } });
            return;

        default: {
            const exhaustiveCheck: never = code;
            void exhaustiveCheck;
            return;
        }
    }
}
