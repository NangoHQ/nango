import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { GeokeoResponse } from './types.js';

// Statuses that mean the request reached Geokeo with a key it recognised
const VALID_KEY_STATUSES = new Set(['OK', 'ZERO_RESULTS', 'OVER_QUERY_LIMIT']);
// Statuses Geokeo returns when it rejects the key: ACCESS_DENIED for an unknown key (or one blocked by its IP or
// HTTP-referrer restriction) and INVALID_REQUEST when the api parameter is missing or invalid
const INVALID_KEY_STATUSES = new Set(['ACCESS_DENIED', 'INVALID_REQUEST']);

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /geocode/v1/search.php (Forward Geocoding), a read-only lookup; Nango adds the api query parameter.
    // Geokeo documents this endpoint, with its request, response and response codes, on its single API reference page:
    // https://geokeo.com/documentation.php
    // Errors come back with a 200 status and a code in the JSON `status` field (ACCESS_DENIED for a rejected key),
    // listed under Response Codes on the same page.
    // Other failures (network errors, 5xx without a status body) are rethrown as they are.
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/geocode/v1/search.php',
        params: { q: 'london' },
        providerConfigKey: provider_config_key
    });

    const body = parseBody('data' in response ? response.data : undefined);
    const status = typeof body?.status === 'string' ? body.status.toUpperCase() : undefined;

    if (status && VALID_KEY_STATUSES.has(status)) {
        return;
    }

    if (status && INVALID_KEY_STATUSES.has(status)) {
        throw new Error('Invalid credentials');
    }

    // a Geokeo outage, but an invalid key has also received it on this endpoint
    if (status === 'INTERNAL_SERVER_ERROR') {
        throw new Error('Geokeo returned INTERNAL_SERVER_ERROR, which it also returns for an invalid API key. Check the key, or try again later.');
    }

    if (status) {
        throw new Error(`Geokeo API error ${status}`);
    }

    throw new Error('Unexpected response from the Geokeo API');
}

function parseBody(raw: unknown): GeokeoResponse | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === 'object' && data !== null ? (data as GeokeoResponse) : null;
}
