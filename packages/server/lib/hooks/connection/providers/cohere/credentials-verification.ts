import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { CohereCheckApiKeyResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // Check API key answers with `valid: false` in the body (not an error status) for a key that is not valid
    // https://docs.cohere.com/reference/check-api-key
    const response = await nango.proxy<CohereCheckApiKeyResponse | string>({
        method: 'POST',
        endpoint: '/v1/check-api-key',
        providerConfigKey: provider_config_key
    });

    if (!isValid(response)) {
        throw new Error('Invalid credentials');
    }
}

function isValid(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('data' in response) || !('status' in response)) {
        return false;
    }

    if (typeof response.status !== 'number' || response.status < 200 || response.status >= 300) {
        return false;
    }

    let data: unknown = response.data;
    // the body may arrive as text if the content type is not JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return false;
        }
    }

    return typeof data === 'object' && data !== null && 'valid' in data && data.valid === true;
}
