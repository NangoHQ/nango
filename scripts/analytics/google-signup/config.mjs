import { readFileSync } from 'node:fs';

export function configuration(diagnostics = false) {
    return {
        type: 'destination',
        name: diagnostics ? 'Google signup diagnostics (manual read)' : 'Google | Account signup | Consent at signup',
        description: 'NAN-7534 / NAN-7683. Proposed click-only Data Manager destination. Default off; OAuth/runtime validation pending.',
        enabled: false,
        hog: readFileSync(new URL(diagnostics ? './diagnostics.hog' : './destination.hog', import.meta.url), 'utf8'),
        inputs_schema: [
            ...(diagnostics ? ['requestId'] : ['customerId', 'loginCustomerId', 'conversionActionId', 'startAt']).map((key) => ({
                key,
                type: 'string',
                required: true,
                templating: false
            })),
            ...['oauthClientId', 'oauthClientSecret', 'oauthRefreshToken'].map((key) => ({
                key,
                type: 'string',
                required: true,
                secret: true,
                templating: false
            })),
            { key: 'deliveryApproved', type: 'boolean', required: true, default: false },
            ...(!diagnostics ? [{ key: 'validateOnly', type: 'boolean', required: true, default: true }] : [])
        ],
        inputs: { deliveryApproved: { value: false }, ...(!diagnostics ? { validateOnly: { value: true } } : {}) },
        filters: { events: [{ id: 'auth:account_create', type: 'events' }], filter_test_accounts: true }
    };
}
