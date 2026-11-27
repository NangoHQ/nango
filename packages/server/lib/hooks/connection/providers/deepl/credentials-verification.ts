import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Every DeepL endpoint is covered by a permission scope, and DeepL answers both a wrong key and a scoped key
// missing the endpoint's scope with 403. Only the "Missing required scope(s)" message tells a valid scoped key apart.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v2/usage (Check usage and limits); 403 "Authorization failed. Please supply a valid DeepL-Auth-Key via the Authorization header",
    // also returned when the key is scoped but lacks the endpoint's scope
    // https://developers.deepl.com/api-reference/usage-and-quota/check-usage-and-limits
    // A scoped key missing a scope gets 403 with "message": "Missing required scope(s): ..."
    // https://developers.deepl.com/docs/admin/api-key-permissions
    // 403 is not retryable; 429, 529, 456 and 5xx are other errors and are rethrown as they are, like network errors
    // https://developers.deepl.com/docs/best-practices/error-handling
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/v2/usage',
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const { status, message } = errorDetails(err);
        if (status === 403) {
            if (message?.startsWith('Missing required scope(s)')) {
                return;
            }
            throw new Error('Invalid credentials');
        }
        throw err;
    }
}

function errorDetails(err: unknown): { status: number | undefined; message: string | undefined } {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return { status: undefined, message: undefined };
    }
    const response = err.response;
    const status = 'status' in response && typeof response.status === 'number' ? response.status : undefined;

    let data: unknown = 'data' in response ? response.data : undefined;
    // the body may come back as text when it was not parsed as JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return { status, message: undefined };
        }
    }

    const message = typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : undefined;
    return { status, message };
}
