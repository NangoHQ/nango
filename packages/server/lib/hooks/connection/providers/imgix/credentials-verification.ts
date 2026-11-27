import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// imgix has no identity endpoint every key can call: keys are scoped by permission, and listing Sources
// needs the Sources permission, so a valid key without it is refused with 403. A 2xx is accepted too.
export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /api/v1/sources (List all Sources for an account), in the Source operations table
    // https://docs.imgix.com/en-US/apis/management/sources#source-operations
    // 401 Unauthorized ("your API key or authenication method is invalid") is documented in the errors section
    // https://docs.imgix.com/en-US/apis/management/overview#errors
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'GET',
            endpoint: '/api/v1/sources?page[number]=0&page[size]=1',
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

// The status decides, so the body (JSON:API or text) is not parsed
function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    return 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}
