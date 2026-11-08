import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key, credentials } = nango.getConnection();
    const apiKey = 'apiKey' in credentials && typeof credentials.apiKey === 'string' ? credentials.apiKey.trim() : '';

    // GET /account (Account API) returns the account's plan and usage, echoing the `api_key` it authenticated; it is free
    // https://serpapi.com/account-api
    // An invalid key is answered with 401 `{"error": "Invalid API key. ..."}` (proxy throws)
    // https://serpapi.com/api-status-and-error-codes
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/account',
        providerConfigKey: provider_config_key
    });

    // SerpApi can answer a near-miss key with the account of the real one, so the echoed key must match the one sent
    if (!isAccountForKey(response, apiKey)) {
        throw new Error('Invalid credentials');
    }
}

function isAccountForKey(response: unknown, apiKey: string): boolean {
    if (!apiKey || typeof response !== 'object' || response === null || !('status' in response) || !('data' in response)) {
        return false;
    }

    if (typeof response.status !== 'number' || response.status < 200 || response.status >= 300) {
        return false;
    }

    let data: unknown = response.data;
    // the body may come back as text when the content type is not JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
    }

    if (typeof data !== 'object' || data === null || ('error' in data && data.error != null)) {
        return false;
    }

    return 'api_key' in data && data.api_key === apiKey;
}
