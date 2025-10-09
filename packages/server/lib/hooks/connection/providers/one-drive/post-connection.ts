import axios from 'axios';
import jwt from 'jsonwebtoken';

import type { MicrosoftDecodedToken, SharePointTokenResponse } from './types.js';
import type { InternalNango as Nango } from '../../internal-nango.js';
import type { OAuth2Credentials } from '@nangohq/types';

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const credentials = connection.credentials as OAuth2Credentials;
    const integration = await nango.getIntegration();

    const decoded = jwt.decode(credentials.access_token) as MicrosoftDecodedToken;
    if (!decoded || typeof decoded !== 'object') {
        return;
    }

    const tenantId = decoded.tid;

    if (!integration || !integration.oauth_client_id || !integration.oauth_client_secret || !credentials.refresh_token) {
        return;
    }

    const params = new URLSearchParams({
        client_id: integration.oauth_client_id,
        client_secret: integration.oauth_client_secret,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token',
        scope: `https://${tenantId}.sharepoint.com/Sites.Read.All`
    });

    const tokenResponse = await nango.proxy<SharePointTokenResponse>({
        method: 'POST',
        baseUrlOverride: 'https://login.microsoftonline.com',
        endpoint: `/${tenantId}/oauth2/v2.0/token`,
        providerConfigKey: connection.provider_config_key,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: params.toString()
    });

    if (!tokenResponse || axios.isAxiosError(tokenResponse) || !tokenResponse.data) {
        return;
    }

    const expires_at = Date.now() + tokenResponse.data.expires_in * 1000;
    const sharepointAccessToken = {
        ...tokenResponse.data,
        expires_at
    };

    await nango.updateConnectionConfig({ tenantId, sharepointAccessToken });
}
