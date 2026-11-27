import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// ngrok has no identity endpoint every key can call: API keys can list endpoints, but a valid access token
// without the endpoints:read scope gets 403 ERR_NGROK_29001, which still proves the token is valid.
// Only ERR_NGROK_202 (malformed credentials), ERR_NGROK_203 (invalid credentials) and ERR_NGROK_200 (missing credentials)
// prove the key is wrong.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /endpoints (List endpoints); the ngrok-version header comes from the provider entry
    // https://ngrok.com/docs/api-reference/endpoints/list
    // ERR_NGROK_202: "The API authentication you specified does not look like a valid credential." (live: 403 for a random key)
    // https://ngrok.com/docs/errors/err_ngrok_202
    // ERR_NGROK_203: "The API authentication you specified is properly formed, but it is invalid."
    // https://ngrok.com/docs/errors/err_ngrok_203
    // ERR_NGROK_200: the request carried no API authentication
    // https://ngrok.com/docs/errors/err_ngrok_200
    // 403 ERR_NGROK_29001 is returned to an access token missing a scope
    // https://ngrok.com/docs/iam/access-tokens
    // Other errors (429 ERR_NGROK_226, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/endpoints',
            params: { limit: '1' },
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const { status, errorCode } = errorDetails(err);
        if (errorCode === 'ERR_NGROK_202' || errorCode === 'ERR_NGROK_203' || errorCode === 'ERR_NGROK_200') {
            throw new Error('Invalid credentials');
        }
        if (status === 403 && errorCode === 'ERR_NGROK_29001') {
            return;
        }
        throw err;
    }
}

function errorDetails(err: unknown): { status: number | undefined; errorCode: string | undefined } {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return { status: undefined, errorCode: undefined };
    }
    const response = err.response;
    const status = 'status' in response && typeof response.status === 'number' ? response.status : undefined;

    let data: unknown = 'data' in response ? response.data : undefined;
    // the body may come back as text when it was not parsed as JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return { status, errorCode: undefined };
        }
    }

    const errorCode = typeof data === 'object' && data !== null && 'error_code' in data && typeof data.error_code === 'string' ? data.error_code : undefined;
    return { status, errorCode };
}
