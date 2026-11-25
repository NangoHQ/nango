import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { ApiSportsStatusResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /status returns the account, subscription and request usage of the key; it does not count against the daily quota
    // https://api-sports.io/documentation/football/v3#section/Authentication/API-SPORTS-Account
    // A missing or mistyped key is documented as 403 Forbidden, with details in the `errors` object of the body
    // https://www.api-football.com/news/post/how-to-get-started-with-api-nfl-the-complete-beginners-guide
    // In practice /status answers a wrong key with 200 and `{"errors": {"token": "Error/Missing application key..."}}`,
    // so only a `token` error in the body means the key is wrong. Other errors (rate limits, firewall blocks, outages,
    // network errors) are rethrown as they are.
    let body: ApiSportsStatusResponse | null;
    try {
        const response = await nango.proxy({
            method: 'GET',
            endpoint: '/status',
            providerConfigKey: provider_config_key
        });
        body = parseBody('data' in response ? response.data : undefined);
    } catch (err) {
        if (errorStatus(err) === 403 && hasTokenError(parseBody(errorBody(err)))) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    if (hasTokenError(body)) {
        throw new Error('Invalid credentials');
    }

    const errors = errorEntries(body);
    if (errors.length > 0) {
        throw new Error(`API-Sports API error: ${errors.map(([key, value]) => `${key}: ${String(value)}`).join('; ')}`);
    }

    // A successful check returns the account details; anything else (non-JSON, an unexpected shape) is not a pass.
    if (body === null || typeof body.response !== 'object' || body.response === null || !('account' in body.response)) {
        throw new Error('Unexpected response from API-Sports while verifying credentials');
    }
}

function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'status' in err.response && typeof err.response.status === 'number' ? err.response.status : undefined;
}

function errorBody(err: unknown): unknown {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'data' in err.response ? err.response.data : undefined;
}

function parseBody(raw: unknown): ApiSportsStatusResponse | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === 'object' && data !== null ? (data as ApiSportsStatusResponse) : null;
}

function errorEntries(body: ApiSportsStatusResponse | null): [string, unknown][] {
    // `errors` is an empty array when the call succeeded and an object keyed by error type when it failed
    const errors = body?.errors;
    if (typeof errors !== 'object' || errors === null) {
        return [];
    }
    return Object.entries(errors);
}

function hasTokenError(body: ApiSportsStatusResponse | null): boolean {
    return errorEntries(body).some(([key]) => key === 'token');
}
