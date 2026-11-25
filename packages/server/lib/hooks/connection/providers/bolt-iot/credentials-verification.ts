import type { InternalNango as Nango } from '../../credentials-verification-script.js';
import type { BoltIotResponse } from './types.js';

export default async function execute(nango: Nango) {
    const { provider_config_key } = nango.getConnection();

    // GET /accountPlan (Get Account Plan) works on every account, Free or Pro, with or without devices.
    // A valid key returns `{"value": "Bolt Cloud", "success": 1}`; an invalid key returns `{"success": 0}` with a 200 status,
    // so the body decides (in practice `{"success": 0, "value": "Invalid API key"}`).
    // https://docs.boltiot.com/api/get-account-plan
    // HTTP errors (rate limits, outages, network errors) are rethrown as they are.
    const response = await nango.proxy({
        method: 'GET',
        endpoint: '/accountPlan',
        providerConfigKey: provider_config_key
    });

    const body = parseBody('data' in response ? response.data : undefined);
    if (body === null) {
        throw new Error('Unexpected response from Bolt IoT while verifying credentials');
    }

    const success = Number(body.success);
    if (success === 1) {
        return;
    }

    if (success === 0) {
        // `success: 0` also covers other failed requests; only treat it as a wrong key when no other reason is given
        if (typeof body.value === 'string' && body.value.length > 0 && !/api key/i.test(body.value)) {
            throw new Error(`Bolt IoT API error: ${body.value}`);
        }
        throw new Error('Invalid credentials');
    }

    throw new Error('Unexpected response from Bolt IoT while verifying credentials');
}

function parseBody(raw: unknown): BoltIotResponse | null {
    let data: unknown = raw;
    // the body may arrive as text if it was not parsed
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch {
            return null;
        }
    }
    return typeof data === 'object' && data !== null && 'success' in data ? (data as BoltIotResponse) : null;
}
