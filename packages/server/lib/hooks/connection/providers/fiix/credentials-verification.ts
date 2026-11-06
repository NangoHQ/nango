import type { InternalNango as Nango } from '../../credentials-verification-script.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // Fiix returns errors (including authentication failures) with a 200 status and an `error` object in the body
    // https://fiixlabs.github.io/api-documentation/guide.html
    const response = await nango.proxy({
        method: 'POST',
        endpoint: '/api/',
        providerConfigKey: provider_config_key,
        data: {
            _maCn: 'FindRequest',
            clientVersion: { major: 2, minor: 8, patch: 1 },
            className: 'Account',
            fields: 'id',
            maxObjects: 1
        }
    });

    if (hasError(response)) {
        throw new Error('Invalid credentials');
    }
}

function hasError(response: unknown): boolean {
    if (typeof response !== 'object' || response === null || !('data' in response)) {
        return true;
    }

    let data: unknown = response.data;
    // responses are sent as text/plain, so the body may not have been parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return true;
        }
    }

    return typeof data !== 'object' || data === null || ('error' in data && data.error != null);
}
