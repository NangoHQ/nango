import axios from 'axios';

import { getLogger } from '@nangohq/utils';

const logger = getLogger('Webhook.GoogleJWKSCache');

interface JWKSResponse {
    keys: Record<string, string>[];
}
interface JWKSCacheEntry extends JWKSResponse {
    expiresAt: number;
}

let jwksCache: JWKSCacheEntry | null = null;

/**
 * Fetches Google JWKS and caches it based on the expires header
 * Returns cached data if still valid, otherwise fetches fresh data
 */
export async function getGoogleJWKS(): Promise<JWKSResponse['keys']> {
    const now = Date.now();

    if (jwksCache && jwksCache.expiresAt > now) {
        logger.debug('Using cached Google JWKS');
        return jwksCache.keys;
    }

    const response = await axios.get<JWKSResponse>('https://www.googleapis.com/oauth2/v3/certs');

    const expiresHeader = response.headers['expires'];

    const expiresAt: number = expiresHeader ? new Date(expiresHeader).getTime() : now + 60 * 60 * 1000;

    jwksCache = {
        keys: response.data.keys,
        expiresAt
    };

    logger.debug(`Cached Google JWKS until ${new Date(expiresAt).toISOString()}`);

    return response.data.keys;
}
