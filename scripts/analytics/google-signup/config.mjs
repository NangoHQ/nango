import { readFileSync } from 'node:fs';

export function configuration(diagnostics = false) {
    return {
        type: 'destination',
        name: diagnostics ? 'Google signup diagnostics (manual read)' : 'Google | Account signup | Consent at signup',
        description: 'NAN-7534 / NAN-7683. Proposed click-only Data Manager destination. Default off; OAuth/runtime validation pending.',
        enabled: false,
        hog: readFileSync(new URL(diagnostics ? './diagnostics.hog' : './destination.hog', import.meta.url), 'utf8'),
        inputs_schema: [
            ...['customerId', 'loginCustomerId', 'conversionActionId', 'startAt', ...(diagnostics ? ['requestId'] : [])].map((key) => ({
                key,
                type: 'string',
                required: false,
                templating: false
            })),
            ...['oauthClientId', 'oauthClientSecret', 'oauthRefreshToken'].map((key) => ({
                key,
                type: 'string',
                required: false,
                secret: true,
                templating: false
            })),
            { key: 'deliveryApproved', type: 'boolean', required: true, default: false },
            { key: 'validateOnly', type: 'boolean', required: true, default: true }
        ],
        inputs: { deliveryApproved: { value: false }, validateOnly: { value: true } },
        filters: { events: [{ id: 'auth:account_create', type: 'events' }], filter_test_accounts: true }
    };
}
