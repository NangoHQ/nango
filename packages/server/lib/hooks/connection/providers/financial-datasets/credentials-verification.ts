import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// Financial Datasets has no account endpoint, and every data endpoint answers a valid key on an unfunded account with 402.
// A wrong or revoked key gets 401; a 402 still proves the key is valid.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /macro/interest-rates/snapshot takes no parameters; its 401 (Invalid API key provided) and 402 responses are on the same page
    // https://docs.financialdatasets.ai/api/macro/interest-rates/snapshot
    // 402 = the account is not funded yet ("Every data call returns 402 Payment Required until the account is funded")
    // https://docs.financialdatasets.ai/agents
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/macro/interest-rates/snapshot',
            providerConfigKey: provider_config_key
        });
    } catch (err) {
        const status = errorStatus(err);
        if (status === 401) {
            throw new Error('Invalid credentials');
        }
        if (status === 402) {
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
