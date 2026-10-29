import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // Campaign Cleaner answers an invalid API key on get_credits with HTTP 200 and `{"credits":0}`;
    // the only signal is the `X-CC-Status: 4001` header (or an `error` body on other endpoints)
    // https://docs.campaigncleaner.com/api-reference/endpoint/delete-campaign
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/v1/get_credits',
        providerConfigKey: provider_config_key
    });

    if (hasError(response)) {
        throw new Error('Invalid credentials');
    }
}

function hasError(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('data' in response)) {
        return true;
    }

    if ('headers' in response && typeof response.headers === 'object' && response.headers !== null) {
        const status = (response.headers as Record<string, unknown>)['x-cc-status'];
        if (String(status) === '4001') {
            return true;
        }
    }

    let data: unknown = response.data;
    // error responses may come back as text, so the body may not have been parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return true;
        }
    }

    return typeof data !== 'object' || data === null || ('error' in data && data.error != null);
}
