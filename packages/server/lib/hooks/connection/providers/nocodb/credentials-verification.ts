import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// NocoDB has no identity endpoint every token can call: a token scoped without workspace access gets 403 here,
// while a wrong, expired or disabled token gets 401. A 2xx is accepted too.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /api/v3/meta/workspaces (List workspaces); base_url already ends in /api
    // https://nocodb.com/apis/v3/meta#/workspaces/workspaces-list
    // 401 (the credential is not valid) and 403 (authenticated but not allowed, e.g. the token scope does not cover the operation) are documented on the errors page
    // https://nocodb.com/docs/apis/errors
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/v3/meta/workspaces',
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

// The status decides, so the body (JSON or text) is not parsed
function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    return 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}
