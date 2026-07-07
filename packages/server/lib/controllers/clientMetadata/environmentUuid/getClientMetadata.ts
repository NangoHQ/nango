import * as z from 'zod';

import { accountService, configService, getGlobalClientMetadataDocumentUrl, getGlobalOAuthCallbackUrl } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { providerConfigKeySchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetPublicClientMetadata } from '@nangohq/types';

const paramValidation = z
    .object({
        environmentUuid: z.string().uuid(),
        providerConfigKey: providerConfigKeySchema
    })
    .strict();

/**
 * Serves the OAuth Client ID Metadata Document (CIMD) for an integration.
 * Authorization servers fetch this document when they encounter our URL-formatted
 * client_id, so it must be publicly reachable and its client_id must match the
 * request URL exactly.
 */
export const getClientMetadata = asyncWrapper<GetPublicClientMetadata>(async (req, res) => {
    const paramValue = paramValidation.safeParse(req.params);
    if (!paramValue.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramValue.error) } });
        return;
    }

    const { environmentUuid, providerConfigKey } = paramValue.data;

    const clientId = getGlobalClientMetadataDocumentUrl(environmentUuid, providerConfigKey);
    if (!clientId) {
        res.status(404).send({
            error: { code: 'feature_disabled', message: 'Client ID metadata documents require NANGO_SERVER_URL to be a public https URL' }
        });
        return;
    }

    const accountContext = await accountService.getAccountContext({ environmentUuid });
    if (!accountContext) {
        res.status(404).send({ error: { code: 'unknown_environment' } });
        return;
    }
    const { environment } = accountContext;

    const integration = await configService.getProviderConfig(providerConfigKey, environment.id);
    if (!integration) {
        res.status(404).send({ error: { code: 'unknown_provider_config' } });
        return;
    }

    const logoUri = integration.custom?.['oauth_client_logo_uri'];

    // Authorization servers cache this document respecting HTTP cache headers.
    // Short TTL so callback URL and branding edits propagate quickly.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send({
        client_id: clientId,
        client_name: integration.custom?.['oauth_client_name'] || 'Nango',
        client_uri: integration.custom?.['oauth_client_uri'] || 'https://nango.dev',
        ...(logoUri && { logo_uri: logoUri }),
        redirect_uris: [environment.callback_url || getGlobalOAuthCallbackUrl()],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none'
    });
});
