import axios from 'axios';
import type { LogContext } from '@nangohq/logs';
import type { OAuthSession } from '@nangohq/shared';
import type { Template as ProviderTemplate, IntegrationConfig as ProviderConfig } from '@nangohq/types';
import { interpolateStringFromObject } from '@nangohq/shared';
import { parseTokenAndSecret, generateBaseString, generateSignature, getTbaMetaParams, SIGNATURE_METHOD, percentEncode } from '@nangohq/utils';

export async function makeAccessTokenRequest({
    template,
    config,
    oauth_token,
    oauth_verifier,
    session,
    logCtx
}: {
    template: ProviderTemplate;
    config: ProviderConfig;
    oauth_token: string;
    oauth_verifier: string;
    session: OAuthSession;
    logCtx: LogContext;
}): Promise<{ token: string; secret: string } | null> {
    const accessTokenEndpoint = template.access_token_url;

    if (!accessTokenEndpoint) {
        return null;
    }

    const { connectionConfig } = session;

    const fullAccessTokenEndpoint = interpolateStringFromObject(accessTokenEndpoint, {
        connectionConfig
    });

    const { nonce, timestamp } = getTbaMetaParams();

    const oauth_client_id = connectionConfig['oauth_client_id'] || config.oauth_client_id;
    const oauth_client_secret = connectionConfig['oauth_client_secret'] || config.oauth_client_secret;

    const oauthParams = {
        oauth_consumer_key: oauth_client_id,
        oauth_nonce: nonce,
        oauth_signature_method: SIGNATURE_METHOD,
        oauth_timestamp: timestamp.toString(),
        oauth_token,
        oauth_verifier
    };

    const unauthorized_oauth_token_secret = connectionConfig['unauthorized_oauth_token_secret'];

    const baseString = generateBaseString({
        method: 'POST',
        url: fullAccessTokenEndpoint,
        params: oauthParams
    });

    const hash = generateSignature({
        baseString,
        clientSecret: oauth_client_secret,
        tokenSecret: unauthorized_oauth_token_secret as string
    });

    const authHeader =
        `OAuth oauth_consumer_key="${percentEncode(oauth_client_id)}",` +
        `oauth_token="${oauth_token}",` +
        `oauth_verifier="${oauth_verifier}",` +
        `oauth_nonce="${nonce}",` +
        `oauth_timestamp="${timestamp}",` +
        `oauth_signature_method="${SIGNATURE_METHOD}",` +
        `oauth_signature="${percentEncode(hash)}"`;

    const headers = {
        Authorization: authHeader
    };

    await logCtx.debug('Third part of the three part flow to obtain an access token', {
        fullAccessTokenEndpoint,
        oauthParams,
        authHeader
    });

    const response = await axios.post(fullAccessTokenEndpoint, null, { headers });

    const { token, secret } = parseTokenAndSecret(response.data);

    return {
        token,
        secret
    };
}
