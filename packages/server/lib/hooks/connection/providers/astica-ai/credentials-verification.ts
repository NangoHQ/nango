import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // POST /api/voice_clone_list is a read-only list of the account's own voice clones and only needs the token.
    // The astica Voice API reference documents this endpoint, the X-API-Key header, the 401 (invalid API token)
    // and the 402 that authentication checks can return when the voice balance is zero or negative (the key is still valid):
    // https://astica.ai/voice/documentation/
    // Other errors (rate limits, outages, network errors) are rethrown as they are.
    try {
        await nango.proxy({
            method: 'POST',
            endpoint: '/voice_clone_list',
            providerConfigKey: provider_config_key,
            data: {}
        });
    } catch (err) {
        const status = errorStatus(err);
        if (status === 402) {
            return;
        }
        if (status === 401) {
            throw new Error('Invalid credentials');
        }
        throw err;
    }
}

function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    return 'status' in err.response && typeof err.response.status === 'number' ? err.response.status : undefined;
}
