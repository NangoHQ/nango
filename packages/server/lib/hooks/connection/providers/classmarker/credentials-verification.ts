import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { ClassmarkerResponse } from './types.js';

// Error codes ClassMarker returns when the API key or secret is wrong, inactive or unknown
const INVALID_CREDENTIAL_CODES = new Set(['apiKeyAuthFail', 'apiKeyInactive', 'noApiKeyExists']);

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v1.json (Get all available groups, links and exams) lists what the key can access; it needs no ids.
    // ClassMarker documents every endpoint, /v1.json included, and its errors on one API reference page:
    // https://www.classmarker.com/online-testing/docs/api/
    // Errors come back with HTTP 200 and `status: "error"` plus an `error.error_code`
    // (apiKeyAuthFail, apiKeyInactive and noApiKeyExists for a wrong, inactive or unknown key), see the Errors section of that page.
    // Other errors (rate limit, timestamp, account not upgraded, maintenance, outages, network errors) are rethrown as they are.
    let body: ClassmarkerResponse | null;
    try {
        const response = await nango.proxy({
            method: 'GET',
            endpoint: '/v1.json',
            providerConfigKey: provider_config_key
        });
        body = parseBody('data' in response ? response.data : undefined);
    } catch (err) {
        if (isInvalidCredential(parseBody(errorBody(err)))) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    if (body?.status === 'ok' || body?.status === 'no_results') {
        return;
    }

    if (isInvalidCredential(body)) {
        throw new Error('Invalid credentials');
    }

    if (body?.status === 'error') {
        throw new Error(`ClassMarker API error ${body.error?.error_code ?? 'unknown'}: ${body.error?.error_message ?? 'no message'}`);
    }

    throw new Error('Unexpected response from the ClassMarker API');
}

function errorBody(err: unknown): unknown {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'data' in err.response ? err.response.data : undefined;
}

function parseBody(raw: unknown): ClassmarkerResponse | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === 'object' && data !== null ? (data as ClassmarkerResponse) : null;
}

function isInvalidCredential(body: ClassmarkerResponse | null): boolean {
    return body?.status === 'error' && INVALID_CREDENTIAL_CODES.has(String(body.error?.error_code ?? ''));
}
