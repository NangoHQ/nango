import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Statuspal has no identity endpoint: every authenticated endpoint needs an organization ID or a status page subdomain,
// which the user does not enter when connecting. The key is checked before the organization, so organization 0 (which
// never exists) answers a wrong key with 401 and a valid key with 404 (live: both key types 404, a random key 401).
// Only 401 means the key is wrong.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /orgs/{organizationId}/status_pages (List status pages); 401 "Authorization information is missing or invalid."
    // https://docs.statuspal.io/platform/api-reference/status-pages#get-orgs-organizationid-status_pages
    // The key is sent as-is in the Authorization header
    // https://docs.statuspal.io/platform/api-reference/authentication
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/v2/orgs/0/status_pages',
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const status = errorStatus(err);
        if (status === 401) {
            throw new Error('Invalid credentials');
        }
        if (status === 403 || status === 404) {
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
