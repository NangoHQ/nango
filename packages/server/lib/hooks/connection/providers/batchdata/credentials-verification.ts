import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// BatchData tokens are scoped per endpoint, so no endpoint is open to every valid token.
// A wrong token gets 401; a valid token without the wallet-balance permission gets 403, which still proves the token is valid.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /api/v1/wallet/balance (wallet balance, free to call, needs the wallet-balance permission)
    // https://help.batchdata.io/en/articles/15334445-wallet-endpoints-reference-balance-consumption-report-credit-card-transactions
    // 403 Forbidden means the token lacks the permissions for the call
    // https://help.batchdata.io/en/articles/13238212-set-up-authentication-and-tokens-to-start-using-batchdata-apis
    // The docs do not document the invalid-token answer: the API answers a wrong token with 401.
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/api/v1/wallet/balance',
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
