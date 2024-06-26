import axios from 'axios';
import type { OAuthSession } from '@nangohq/shared';
import querystring from 'querystring';
import * as crypto from 'node:crypto';
import type { Template as ProviderTemplate, IntegrationConfig as ProviderConfig } from '@nangohq/types';
import { interpolateStringFromObject } from '@nangohq/shared';

export function percentEncode(str: string) {
    return encodeURIComponent(str)
        .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
        .replace(/%20/g, '%20');
}

export function collectParameters(allParams: Record<string, string>): string {
    const encodedParams: [string, string][] = [];

    for (const [key, value] of Object.entries(allParams)) {
        encodedParams.push([percentEncode(key), percentEncode(value)]);
    }

    encodedParams.sort((a, b) => {
        if (a[0] === b[0]) {
            return a[1] < b[1] ? -1 : 1;
        }
        return a[0] < b[0] ? -1 : 1;
    });

    return encodedParams.map((pair) => pair.join('=')).join('&');
}

export async function makeAccessTokenRequest({
    template,
    config,
    oauth_token,
    oauth_verifier,
    session
}: {
    template: ProviderTemplate;
    config: ProviderConfig;
    oauth_token: string;
    oauth_verifier: string;
    session: OAuthSession;
}): Promise<{ token: string; secret: string } | null> {
    const accessTokenEndpoint = template.access_token_url;

    if (!accessTokenEndpoint) {
        return null;
    }

    const { connectionConfig } = session;

    const fullAccessTokenEndpoint = interpolateStringFromObject(accessTokenEndpoint, {
        connectionConfig
    });

    const nonce = crypto.randomBytes(24).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureMethod = 'HMAC-SHA256';

    const oauthParams = {
        oauth_consumer_key: config.oauth_client_id,
        oauth_nonce: nonce,
        oauth_signature_method: signatureMethod,
        oauth_timestamp: timestamp.toString(),
        oauth_token,
        oauth_verifier
    };

    const concatenatedParams = collectParameters(oauthParams);

    const oauth_token_secret = connectionConfig['oauth_token_secret'];

    const baseString = `POST&${percentEncode(fullAccessTokenEndpoint)}&${percentEncode(concatenatedParams)}`;

    const hash = crypto
        .createHmac('sha256', `${percentEncode(config.oauth_client_secret)}&${percentEncode(oauth_token_secret as string)}`)
        .update(baseString)
        .digest('base64');

    const authHeader =
        `OAuth oauth_consumer_key="${percentEncode(config.oauth_client_id)}",` +
        `oauth_token="${oauth_token}",` +
        `oauth_verifier="${oauth_verifier}",` +
        `oauth_nonce="${nonce}",` +
        `oauth_timestamp="${timestamp}",` +
        `oauth_signature_method="${signatureMethod}",` +
        `oauth_signature="${percentEncode(hash)}"`;

    const headers = {
        Authorization: authHeader
    };

    const response = await axios.post(fullAccessTokenEndpoint, null, { headers });

    const parsedData = querystring.parse(response.data);

    const { oauth_token: finalOAuthToken, oauth_token_secret: finalOAuthTokenSecret } = parsedData;

    return { token: String(finalOAuthToken), secret: String(finalOAuthTokenSecret) };
}
