import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { BaselinkerResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // POST /connector.php with method=getInventories (a read-only list of catalogs, no input parameters)
    // https://api.baselinker.com/?method=getInventories
    // Failures come back in the JSON body as `status: "ERROR"` with `error_code` and `error_message`; the HTTP status
    // for a rejected token is not documented, so only a token error code in the body means the token is wrong.
    // Other errors (rate-limit blocks, outages, network errors) are rethrown as they are.
    let body: BaselinkerResponse | null;
    try {
        const response = await nango.proxy({
            method: 'POST',
            endpoint: '/connector.php',
            providerConfigKey: provider_config_key,
            data: 'method=getInventories&parameters=%7B%7D',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        body = parseBody('data' in response ? response.data : undefined);
    } catch (err) {
        if (isTokenError(parseBody(errorBody(err)))) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    if (body?.status === 'SUCCESS') {
        return;
    }

    if (isTokenError(body)) {
        throw new Error('Invalid credentials');
    }

    if (body?.status === 'ERROR') {
        throw new Error(`BaseLinker API error ${body.error_code ?? 'unknown'}: ${body.error_message ?? 'no message'}`);
    }

    throw new Error('Unexpected response from the BaseLinker API');
}

function errorBody(err: unknown): unknown {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'data' in err.response ? err.response.data : undefined;
}

function parseBody(raw: unknown): BaselinkerResponse | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === 'object' && data !== null ? (data as BaselinkerResponse) : null;
}

function isTokenError(body: BaselinkerResponse | null): boolean {
    // e.g. ERROR_BAD_TOKEN for an unknown or malformed token
    return body?.status === 'ERROR' && /TOKEN/i.test(String(body.error_code ?? ''));
}
