import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// A valid key with no lookup balance gets 402 (4020 balance depleted, 4021 lookup limit reached), so proxy.verification
// would reject it: the key is recognised, so a 402 is accepted along with a 2xx.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /v1/autocomplete/addresses (Find Address): free, read-only
    // https://docs.ideal-postcodes.co.uk/docs/api/find-address
    // 401 with code 4010 (Invalid Key) and 402 with codes 4020 and 4021 are documented on the error codes page
    // https://docs.ideal-postcodes.co.uk/docs/guides/error-codes
    // Other errors (4011 allowed URLs, rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/v1/autocomplete/addresses',
            params: { query: 'a', limit: '1' },
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const status = errorStatus(err);
        if (status === 401 && errorCode(err) === 4010) {
            throw new Error('Invalid credentials');
        }
        if (status === 402) {
            return;
        }
        throw err;
    }
}

function errorResponse(err: unknown): object | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return err.response;
}

function errorStatus(err: unknown): number | undefined {
    const response = errorResponse(err);
    return response && 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}

function errorCode(err: unknown): number | undefined {
    const response = errorResponse(err);
    if (!response || !('data' in response)) {
        return undefined;
    }

    let data: unknown = response.data;
    // the body may arrive as text if it was not parsed as JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return undefined;
        }
    }

    if (typeof data !== 'object' || data === null || !('code' in data)) {
        return undefined;
    }
    return typeof data.code === 'number' ? data.code : Number(data.code);
}
