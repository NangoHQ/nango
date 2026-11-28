import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Every endpoint needs a specific permission, and scoped keys (e.g. the Image Creator preset) may lack usage:read,
// so a valid key can get 403 here while a wrong key gets 401. A 2xx or a 403 is accepted.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v1/usage (Usage) is read-only, needs the usage:read permission and no resource ids
    // https://docs.htmlcsstoimage.com/management-api/usage/
    // Missing or invalid credentials return 401; insufficient permissions return 403 with the required permission in the message
    // https://docs.htmlcsstoimage.com/getting-started/using-the-api/
    // https://docs.htmlcsstoimage.com/getting-started/using-the-api/permissions/
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/v1/usage',
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
