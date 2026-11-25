import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Integration Keys are scoped Read/Write per area, so a valid key without Users access gets 403 SCOPE-REQUIRED:
// that answer still proves the key is valid. Every other 400 or 403 is a missing, unknown, revoked or expired key.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /Users/Users lists the company's users, which always include the account owner
    // ("[GET] /Users/Users" in the API Endpoints guide v1.16, linked from https://ascora.com.au/kb/api-endpoints)
    // https://www.dropbox.com/scl/fi/uoje4vlnmv8pawl8napcm/API-Endpoints-v-1.16.pdf?rlkey=kd9a24gde3zogr73hnkdncaz9&dl=1
    // Invalid keys: 400 for a missing or empty Auth header, 403 "Unauthorized User." for an unknown Company Key,
    // 403 API-KEY-INVALID, API-KEY-REVOKED or API-KEY-EXPIRED for Integration Keys, 403 SCOPE-REQUIRED for a valid key without access
    // https://ascora.com.au/kb/ascora-api-keys-the-auth-header-errors-and-ra
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/Users/Users',
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const response = errorResponse(err);
        if (response && response.status === 403 && bodyText(response.data).includes('SCOPE-REQUIRED')) {
            return;
        }
        if (response && (response.status === 400 || response.status === 403)) {
            throw new Error('Invalid credentials');
        }
        // rate limits, outages and network errors are not proof the key is wrong
        throw err;
    }
}

function errorResponse(err: unknown): { status: number; data: unknown } | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    if (!('status' in response) || typeof response.status !== 'number') {
        return undefined;
    }
    return { status: response.status, data: 'data' in response ? response.data : undefined };
}

// the error body may be JSON or plain text, so it is searched as text
function bodyText(data: unknown): string {
    if (typeof data === 'string') {
        return data;
    }
    if (data === undefined || data === null) {
        return '';
    }
    try {
        return JSON.stringify(data);
    } catch {
        return '';
    }
}
