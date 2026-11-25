import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key, credentials } = nango.getConnection();

    // Clientary takes the API Token as both the Basic auth username and password, but only checks the username:
    // a real token with any other password still gets 200, so a password that is not the same token is rejected here.
    // "HTTP Basic Auth with your API Token as both username and password" https://www.clientary.com/api
    if (!('username' in credentials) || !('password' in credentials) || !credentials.username || credentials.username !== credentials.password) {
        throw new Error('Invalid credentials');
    }

    // GET /api/v2/staff lists the account's team members, which always include the token's own user
    // https://www.clientary.com/api/staff
    // The docs list no error codes: the API answers a missing token with 401 and an unknown token with 403.
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/v2/staff',
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const status = errorStatus(err);
        if (status === 401 || status === 403) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }
}

// The status decides: the 403 body is empty and the 401 body is plain text, so bodies are not parsed
function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    return 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}
