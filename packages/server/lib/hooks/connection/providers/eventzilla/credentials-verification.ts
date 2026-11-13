import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { EventzillaCategoriesResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v2/categories (List event categories) returns the event categories of the authenticated account; it needs no ids or paging
    // https://developer.eventzilla.net/#tag/Event-categories/operation/listCategories
    // Missing or invalid API keys may return 401 Unauthorized
    // https://developer.eventzilla.net/#errors-and-response-codes
    // This endpoint also answers a wrong key with 200 and `{"message": "API Key is not authorized"}` instead of a category list.
    // Other errors (outages, rate limits, network errors) are rethrown as they are.
    let data: unknown;
    try {
        const response = await nango.proxy({
            method: 'GET',
            endpoint: '/v2/categories',
            providerConfigKey: provider_config_key
        });
        data = 'data' in response ? response.data : undefined;
    } catch (err) {
        if (errorStatus(err) === 401) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    const body = parseBody(data);
    if (isNotAuthorized(body)) {
        throw new Error('Invalid credentials');
    }
    // A successful check must return the category list; anything else (non-JSON, an unexpected shape) is not a pass.
    if (body === null || body.categories === undefined) {
        throw new Error('Unexpected response from Eventzilla while verifying credentials');
    }
}

function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'status' in err.response && typeof err.response.status === 'number' ? err.response.status : undefined;
}

function parseBody(raw: unknown): EventzillaCategoriesResponse | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === 'object' && data !== null ? (data as EventzillaCategoriesResponse) : null;
}

function isNotAuthorized(body: EventzillaCategoriesResponse | null): boolean {
    return body !== null && body.categories === undefined && /api key is not authorized/i.test(String(body.message ?? ''));
}
