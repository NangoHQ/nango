import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v2/getcredits returns the account's credit balance; it is read-only and uses no credits.
    // ZeroBounce answers an invalid key with a 200 and `{"Credits": "-1"}` ("If a -1 is returned, that means your API Key is invalid."):
    // https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-credit-balance
    // Non-2xx answers (429, 5xx, a 403 from API Shield) and network errors are rethrown by the proxy as they are.
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/v2/getcredits',
        providerConfigKey: provider_config_key
    });

    if (isInvalidKey(response)) {
        throw new Error('Invalid credentials');
    }
}

function isInvalidKey(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('data' in response)) {
        return false;
    }

    let data: unknown = response.data;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
    }

    if (typeof data !== 'object' || data === null || !('Credits' in data)) {
        return false;
    }

    // Credits is sent as a string, e.g. "2375323" or "-1"
    return Number(data.Credits) === -1;
}
