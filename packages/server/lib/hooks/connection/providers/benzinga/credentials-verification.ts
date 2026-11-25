import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Benzinga has no account endpoint and every data endpoint depends on the customer's plan.
// A wrong key gets 401 on every endpoint; a valid key whose plan lacks the endpoint gets 403, which still proves the key is valid.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /api/v2/news (News), pageSize=1 keeps the page small; its 401 Unauthorized response is shown on the same page
    // https://docs.benzinga.com/api-reference/news-api/get-news-items
    // 401 = no valid API key, 403 = the API key is valid but has no access to the resource
    // https://docs.benzinga.com/api-reference/errors
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/api/v2/news',
            params: { pageSize: '1' },
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const status = errorStatus(err);
        if (status === 401) {
            throw new Error('Invalid credentials');
        }
        if (status === 403) {
            return;
        }
        throw err;
    }
}

// The status decides: bodies vary between endpoints (XML, plain text or JSON), so they are not parsed
function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    return 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}
