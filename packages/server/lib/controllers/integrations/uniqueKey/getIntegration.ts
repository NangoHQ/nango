import * as z from 'zod';

import { zodErrorToHTTP } from '@nangohq/utils';

import { integrationCredentialsToPublicApi, integrationToPublicApi } from '../../../formatters/integration.js';
import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { hasScope } from '../../../middleware/scope.middleware.js';
import integrationService from '../../../services/integration.service.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { ApiPublicIntegrationInclude, GetPublicIntegration } from '@nangohq/types';

export const validationParams = z
    .object({
        uniqueKey: providerConfigKeySchema
    })
    .strict();

const valInclude = z.enum(['webhook', 'credentials']);
const validationQuery = z
    .object({
        include: z
            .union([valInclude, z.array(valInclude)])
            .transform((val) => (Array.isArray(val) ? val : val ? [val] : []))
            .optional()
    })
    .strict();

export const getPublicIntegration = asyncWrapper<GetPublicIntegration>(async (req, res) => {
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

    const { environment, authType } = res.locals;
    const params: GetPublicIntegration['Params'] = valParams.data;
    const query: GetPublicIntegration['Querystring'] = valQuery.data;

    const queryInclude = new Set(query.include || []);
    if (queryInclude.size > 0 && authType !== 'secretKey') {
        // This endpoint is not reachable any other way right now BUT it's to prevent any future mistakes
        res.status(403).send({ error: { code: 'invalid_permissions', message: "Can't include credentials without a private key" } });
        return;
    }

    const result = await integrationService.get({
        environmentId: environment.id,
        environmentUuid: environment.uuid,
        integrationId: params.uniqueKey,
        includeWebhook: queryInclude.has('webhook'),
        includeCredentials:
            queryInclude.has('credentials') &&
            hasScope({ grantedScopes: res.locals['apiKeyScopes'], requiredScope: 'environment:integrations:read_credentials' })
    });
    if (result.isErr()) {
        if (result.error.code === 'not_found') {
            res.status(404).send({ error: { code: 'not_found', message: result.error.message } });
            return;
        }

        res.status(500).send({ error: { code: 'server_error', message: result.error.message } });
        return;
    }

    const { integration, provider, webhookUrl, credentials } = result.value;
    const include: ApiPublicIntegrationInclude = {};
    if (webhookUrl !== undefined) {
        include.webhook_url = webhookUrl;
    }
    if (credentials !== undefined) {
        include.credentials = integrationCredentialsToPublicApi(credentials);
    }

    res.status(200).send({
        data: integrationToPublicApi({ integration, include, provider })
    });
});
