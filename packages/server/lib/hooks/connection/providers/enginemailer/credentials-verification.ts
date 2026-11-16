import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { EnginemailerResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /restapi/subscriber/emsubscriber/getCustomField (Get Custom Field), a read-only list of the account's custom fields
    // https://enginemailer.zendesk.com/hc/en-us/articles/360000737432-Get-Custom-Field
    // A rejected key is answered with `{"Result":{"StatusCode":"500","Status":"InternalServerError","ErrorMessage":"Authentication Failed!"}}`
    // in the body; the HTTP status is not documented, so only that body means the key is wrong. Other errors (outages, rate limits) are rethrown.
    let data: unknown;
    try {
        const response = await nango.proxy({
            method: 'GET',
            endpoint: '/restapi/subscriber/emsubscriber/getCustomField',
            providerConfigKey: provider_config_key
        });
        data = 'data' in response ? response.data : undefined;
    } catch (err) {
        if (isAuthenticationFailure(errorBody(err))) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }

    if (isAuthenticationFailure(data)) {
        throw new Error('Invalid credentials');
    }
}

function errorBody(err: unknown): unknown {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'data' in err.response ? err.response.data : undefined;
}

function isAuthenticationFailure(body: unknown): boolean {
    let data: unknown = body;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
    }
    if (typeof data !== 'object' || data === null || !('Result' in data)) {
        return false;
    }
    const result = (data as EnginemailerResponse).Result;
    return typeof result === 'object' && result !== null && /authentication failed/i.test(String(result.ErrorMessage ?? ''));
}
