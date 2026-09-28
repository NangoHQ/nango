import axios from 'axios';
import jwt from 'jsonwebtoken';
import * as z from 'zod';

import { getLogger } from '@nangohq/utils';

import type { InternalNango as Nango } from '../../internal-nango.js';
import type { TeamsDevPortalTokenResponse } from './types.js';
import type { OAuth2Credentials } from '@nangohq/types';

const logger = getLogger('post-connection:microsoft-teams');

const TEAMS_DEV_PORTAL_SCOPE = 'https://dev.teams.microsoft.com/AppDefinitions.ReadWrite';

const MicrosoftTeamsJWTPayloadSchema = z.object({
    tid: z.string()
});

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const credentials = connection.credentials as OAuth2Credentials;
    const decoded = jwt.decode(credentials.access_token);

    const parsed = MicrosoftTeamsJWTPayloadSchema.safeParse(decoded);
    if (!parsed.success) {
        logger.info('Failed to parse decoded JWT payload. Skipping tenant_id update.');
        return;
    }
    const tenantId = parsed.data.tid;

    await nango.updateConnectionConfig({ tenantId });

    const integration = await nango.getIntegration();

    // Only mint a Teams Dev Portal token when the integration explicitly requests the
    // AppDefinitions.ReadWrite scope. Messaging-only integrations skip this entirely.
    if (!integration?.oauth_scopes?.includes('dev.teams.microsoft.com')) {
        return;
    }

    if (!integration.oauth_client_id || !integration.oauth_client_secret || !credentials.refresh_token) {
        return;
    }

    const params = new URLSearchParams({
        client_id: integration.oauth_client_id,
        client_secret: integration.oauth_client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token',
        scope: TEAMS_DEV_PORTAL_SCOPE
    });

    const tokenResponse = await nango
        .proxy<TeamsDevPortalTokenResponse>({
            method: 'POST',
            baseUrlOverride: 'https://login.microsoftonline.com',
            endpoint: `/${tenantId}/oauth2/v2.0/token`,
            providerConfigKey: connection.provider_config_key,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: params.toString()
        })
        .catch(() => null);

    if (!tokenResponse || axios.isAxiosError(tokenResponse) || !tokenResponse.data?.access_token) {
        return;
    }

    const expires_at = Date.now() + tokenResponse.data.expires_in * 1000;
    const devPortalAccessToken = {
        ...tokenResponse.data,
        expires_at
    };

    await nango.updateConnectionConfig({ devPortalAccessToken });
}
