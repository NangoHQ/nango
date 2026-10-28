import * as z from 'zod';

import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToPublicApi } from '../../formatters/integration.js';
import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema,
    providerSchema
} from '../../helpers/validation.js';
import integrationService, { trackIntegrationCreate } from '../../services/integration.service.js';
import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';

import type { CreateIntegrationServiceError } from '../../services/integration.service.js';
import type { PostPublicIntegration } from '@nangohq/types';
import type { Response } from 'express';

const logger = getLogger('Server.PostIntegration');

// `NANGO_MANAGED` selects a Nango-managed developer app instead of caller-supplied credentials. Create-only: an
// existing integration can't be switched to Nango-managed credentials, so PATCH keeps `integrationCredentialsSchema`.
const createCredentialsSchema = z.discriminatedUnion(
    'type',
    [...integrationCredentialsSchema.options, z.object({ type: z.literal('NANGO_MANAGED') }).strict()],
    {
        error: () => ({ message: 'invalid credentials object' })
    }
);

const validationBody = z
    .object({
        provider: providerSchema,
        unique_key: providerConfigKeySchema,
        display_name: integrationDisplayNameSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema,
        credentials: createCredentialsSchema.optional(),
        integration_config: z.record(z.string(), z.string().max(8192)).optional(),
        custom: z.record(z.string(), z.string()).optional()
    })
    .strict()
    .superRefine((body, ctx) => {
        if (body.credentials?.type !== 'NANGO_MANAGED') {
            return;
        }
        for (const field of ['integration_config', 'custom'] as const) {
            if (body[field] !== undefined) {
                ctx.addIssue({ code: 'custom', path: [field], message: `${field} is not supported with NANGO_MANAGED credentials` });
            }
        }
    });

export const postPublicIntegration = asyncWrapperWithEnvironment<PostPublicIntegration>(async (req, res) => {
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

    const { environment, account } = res.locals;
    const body: PostPublicIntegration['Body'] = valBody.data;
    const credentials = body.credentials;
    const nangoManaged = credentials?.type === 'NANGO_MANAGED';
    const result = await integrationService.create({
        environmentId: environment.id,
        provider: body.provider,
        uniqueKey: body.unique_key,
        credentialSource: nangoManaged ? 'nango' : 'own',
        displayName: body.display_name,
        forwardWebhooks: body.forward_webhooks,
        credentials: nangoManaged ? undefined : credentials,
        integrationConfig: body.integration_config,
        custom: body.custom,
        environment,
        team: account
    });
    if (result.isErr()) {
        sendCreateIntegrationError(res, result.error);
        return;
    }

    trackIntegrationCreate(result.value.integration, 'api');
    res.status(200).send({
        data: integrationToPublicApi(result.value)
    });
});

function sendCreateIntegrationError(res: Response, error: CreateIntegrationServiceError): void {
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
            res.status(400).send({ error: { code: 'invalid_body', message: error.message } });
            return;
        case 'missing_credentials':
            res.status(400).send({ error: { code: 'invalid_body', message: 'Missing credentials' } });
            return;
        case 'nango_credentials_unsupported':
            res.status(400).send({
                error: { code: 'invalid_body', message: 'NANGO_MANAGED credentials are only available for providers that require a developer app' }
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
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create integration' } });
            return;

        default: {
            const exhaustiveCheck: never = code;
            logger.error('Unexpected IntegrationService error code while creating integration', { code: exhaustiveCheck });
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to create integration' } });
            return;
        }
    }
}
