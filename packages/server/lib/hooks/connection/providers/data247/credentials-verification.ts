import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { Data247Response } from './types.js';

// Error codes Data247 returns when the API key is wrong or unknown
const INVALID_CREDENTIAL_CODES = new Set(['D247_INVALID_API_KEY', 'D247_INVALID_CREDENTIALS']);

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v3.0?api=B (Balance Inquiry, service code B, needs no input fields), documented in the
    // "Balance Inquiry" and "API Error Messages" sections of the Data247 API user manual:
    // https://www.data247.com/api_user_manual
    // A wrong key gets a JSON body with `response.status` D247_INVALID_API_KEY and no HTTP error status, as this /v3.0?api=B call shows:
    // https://api.data247.com/v3.0?key=invalid&api=B
    // Other errors (IP not allowed, inactive account, no funds, outages, network errors) are rethrown as they are.
    let body: Data247Response | null;
    try {
        const response = await nango.proxy({
            method: 'GET',
            endpoint: '/v3.0',
            params: { api: 'B' },
            providerConfigKey: provider_config_key
        });
        body = parseBody('data' in response ? response.data : undefined);
    } catch (err) {
        if (isInvalidCredential(parseBody(errorBody(err)))) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    const status = body?.response?.status;
    if (status === 'OK') {
        return;
    }

    if (isInvalidCredential(body)) {
        throw new Error('Invalid credentials');
    }

    if (status) {
        throw new Error(`Data247 API error ${status}: ${body?.response?.message ?? 'no message'}`);
    }

    throw new Error('Unexpected response from the Data247 API');
}

function errorBody(err: unknown): unknown {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'data' in err.response ? err.response.data : undefined;
}

function parseBody(raw: unknown): Data247Response | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === 'object' && data !== null ? (data as Data247Response) : null;
}

function isInvalidCredential(body: Data247Response | null): boolean {
    return INVALID_CREDENTIAL_CODES.has(String(body?.response?.status ?? ''));
}
