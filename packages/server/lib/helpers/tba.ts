import axios from 'axios';
import type { OAuthSession } from '@nangohq/shared';
import type { Provider, IntegrationConfig as ProviderConfig } from '@nangohq/types';
import { interpolateStringFromObject } from '@nangohq/shared';
import { generateBaseString, generateSignature, getTbaMetaParams, SIGNATURE_METHOD, percentEncode } from '@nangohq/utils';

export async function makeAccessTokenRequest({
    provider,
    config,
    oauth_token,
    oauth_verifier,
    session
}: {
    provider: Provider;
    config: ProviderConfig;
    oauth_token: string;
    oauth_verifier: string;
    session: OAuthSession;
}): Promise<{ token: string; secret: string } | null> {
    const accessTokenEndpoint = provider.access_token_url;

    if (!accessTokenEndpoint) {
        return null;
    }

    const { connectionConfig } = session;

    const fullAccessTokenEndpoint = interpolateStringFromObject(accessTokenEndpoint, {
        connectionConfig
    });

    const { nonce, timestamp } = getTbaMetaParams();

    const oauthParams = {
        oauth_consumer_key: config.oauth_client_id || '',
        oauth_nonce: nonce,
        oauth_signature_method: SIGNATURE_METHOD,
        oauth_timestamp: timestamp.toString(),
        oauth_token,
        oauth_verifier
    };

    const oauth_token_secret = connectionConfig['oauth_token_secret'];

    const baseString = generateBaseString({
        method: 'POST',
        url: fullAccessTokenEndpoint,
        params: oauthParams
    });

    const hash = generateSignature({
        baseString,
        clientSecret: config.oauth_client_secret || '',
        tokenSecret: oauth_token_secret as string
    });

    const authHeader =
        `OAuth oauth_consumer_key="${percentEncode(config.oauth_client_id || '')}",` +
        `oauth_token="${oauth_token}",` +
        `oauth_verifier="${oauth_verifier}",` +
        `oauth_nonce="${nonce}",` +
        `oauth_timestamp="${timestamp}",` +
        `oauth_signature_method="${SIGNATURE_METHOD}",` +
        `oauth_signature="${percentEncode(hash)}"`;

    const headers = {
        Authorization: authHeader
    };

    const response = await axios.post(fullAccessTokenEndpoint, null, { headers });

    const parsedData = new URLSearchParams(response.data);

    return {
        token: parsedData.get('oauth_token') as string,
        secret: parsedData.get('oauth_token_secret')?.replace(/\r?\n|\r/g, '') as string
    };
}
