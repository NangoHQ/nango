import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { MoosendResponse } from './types.js';

// Moosend answers a missing or malformed key with `{"Code":104,"Error":"API_KEY_NOT_VALID"}`
// and an unknown key with `{"Code":100,"Error":"USER_NOT_FOUND"}`, both with HTTP 200
const INVALID_KEY_ERRORS = ['API_KEY_NOT_VALID', 'USER_NOT_FOUND'];

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v3/lists.json (Get all active mailing lists), a read-only list of the account's email lists
    // https://docs.moosend.com/api-documentation/articles/KnowledgeBase/54568-Get-all-active-mailing-lists?lang=en_US
    // Errors come back in the response body's `Code` and `Error` fields (`Code` 0 and `Error` null on success):
    // https://docs.moosend.com/api-documentation/articles/KnowledgeBase/54553-Request-and-response-parameters?lang=en_US
    // Only the invalid-key errors mean the key is wrong; other failures (outages, rate limits) are reported as they are.
    let data: unknown;
    try {
        const response = await nango.proxy({
            method: 'GET',
            endpoint: '/v3/lists.json',
            providerConfigKey: provider_config_key
        });
        data = 'data' in response ? response.data : undefined;
    } catch (err) {
        if (invalidKeyError(errorBody(err))) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    const body = parse(data);
    if (invalidKeyError(body)) {
        throw new Error('Invalid credentials');
    }
    if (body && typeof body.Error === 'string' && body.Error.length > 0) {
        throw new Error(`Moosend returned ${body.Error}`);
    }
    // success is the documented `Code` 0 envelope, anything else is unexpected
    if (body?.Code !== 0) {
        throw new Error('Unexpected response from the Moosend API');
    }
}

function errorBody(err: unknown): unknown {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'data' in err.response ? err.response.data : undefined;
}

function parse(body: unknown): MoosendResponse | undefined {
    let data: unknown = body;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return undefined;
        }
    }
    return typeof data === 'object' && data !== null ? (data as MoosendResponse) : undefined;
}

function invalidKeyError(body: unknown): boolean {
    const data = parse(body);
    return typeof data?.Error === 'string' && INVALID_KEY_ERRORS.includes(data.Error);
}
