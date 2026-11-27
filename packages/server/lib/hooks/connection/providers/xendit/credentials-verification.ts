import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Xendit keys carry per-product permissions and no endpoint is open to every key.
// A wrong key gets 401 INVALID_API_KEY; a valid key without Balance access gets 403 REQUEST_FORBIDDEN_ERROR, which still proves the key is valid.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /balance (Get balance)
    // https://docs.xendit.co/apidocs/get-balance
    // 401 INVALID_API_KEY and 403 REQUEST_FORBIDDEN_ERROR responses are documented on the Get Payout by ID page
    // https://docs.xendit.co/apidocs/get-payout-v3-by-id
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/balance',
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const { status, errorCode } = errorDetails(err);
        if (status === 401 && errorCode === 'INVALID_API_KEY') {
            throw new Error('Invalid credentials');
        }
        if (status === 403 && errorCode === 'REQUEST_FORBIDDEN_ERROR') {
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
