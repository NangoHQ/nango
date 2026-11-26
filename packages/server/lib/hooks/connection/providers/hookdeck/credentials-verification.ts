import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Hookdeck has no identity endpoint a project key can always call: project keys cannot call the Platform API,
// so a valid key gets 403 here and a wrong key gets 401. A 2xx is accepted too.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /projects (List projects)
    // https://hookdeck.com/docs/platform/api#listprojects
    // 401 Unauthorized ("Your API key is wrong.") and 403 Forbidden are documented on the status and error codes page
    // https://hookdeck.com/docs/events#status-and-error-codes
    // A request without its required scope returns 403, and project keys cannot call the Platform API
    // https://hookdeck.com/docs/platform/api-keys
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/2026-09-01/projects',
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
