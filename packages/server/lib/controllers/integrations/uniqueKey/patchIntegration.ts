import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { integrationToPublicApi } from '../../../formatters/integration.js';
import {
    integrationCredentialsSchema,
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    providerConfigKeySchema
} from '../../../helpers/validation.js';
import integrationService from '../../../services/integration.service.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { validationParams } from './getIntegration.js';

import type { UpdateIntegrationsServiceError } from '../../../services/integration.service.js';
import type { PatchPublicIntegration } from '@nangohq/types';
import type { Response } from 'express';

const validationBody = z
    .object({
        unique_key: providerConfigKeySchema.optional(),
        display_name: integrationDisplayNameSchema.optional(),
        credentials: integrationCredentialsSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema,
        integration_config: z.record(z.string(), z.string().max(8192)).optional(),
        custom: z.record(z.string(), z.string()).optional()
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
    const result = await integrationService.update({
        environmentId: environment.id,
        integrationId: params.uniqueKey,
        newIntegrationId: body.unique_key,
        displayName: body.display_name,
        credentials: body.credentials,
        forwardWebhooks: body.forward_webhooks,
        integrationConfig: body.integration_config,
        custom: body.custom
    });
    if (result.isErr()) {
        sendUpdateIntegrationError(res, result.error);
        return;
    }

    res.status(200).send({
        data: integrationToPublicApi(result.value)
    });
});

function sendUpdateIntegrationError(res: Response, error: UpdateIntegrationsServiceError): void {
    const code = error.code;
    switch (code) {
        case 'not_found':
            res.status(404).send({ error: { code: 'not_found', message: error.message } });
            return;
        case 'incompatible_credentials':
            res.status(400).send({ error: { code: 'invalid_body', message: 'incompatible credentials auth type and provider auth' } });
            return;
        case 'integration_exists':
            res.status(400).send({ error: { code: 'invalid_body', message: 'uniqueKey is already used by another integration' } });
            return;
        case 'integration_has_connections':
        case 'invalid_integration_config':
        case 'custom_not_allowed':
            res.status(400).send({ error: { code: 'invalid_body', message: error.message } });
            return;
        case 'update_failed':
            res.status(500).send({ error: { code: 'server_error', message: error.message } });
            return;

        default: {
            const exhaustiveCheck: never = code;
            void exhaustiveCheck;
            return;
        }
    }
}
