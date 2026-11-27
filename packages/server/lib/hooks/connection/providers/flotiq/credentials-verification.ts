import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// User Defined API keys are scoped to some content types and actions, so a valid scoped key gets 403 on /api/auth-context.
// Only 401 proves the key is wrong; a 2xx or a 403 is accepted.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /api/auth-context is Flotiq's API key validity check
    // https://flotiq.com/docs/API/
    // 401 {"code": 401, "message": "Unauthorized"} is returned when the API key is missing or incorrect
    // https://flotiq.com/docs/API/get-started/
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/api/auth-context',
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
