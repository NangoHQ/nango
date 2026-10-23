import { readFileSync } from 'node:fs';

export function configuration() {
    return {
        type: 'destination',
        name: 'Reddit | Completed account signup | Consent at signup',
        description: 'Click-only CUSTOM NangoAccountCreate. Default off; platform credentials and receipts unverified.',
        enabled: false,
        hog: readFileSync(new URL('./reddit-destination.hog', import.meta.url), 'utf8'),
        inputs_schema: [
            ...['pixelId', 'startAt'].map((key) => ({ key, type: 'string', required: true, templating: false })),
            { key: 'accessToken', type: 'string', required: true, secret: true, templating: false },
            { key: 'testId', type: 'string', required: false, templating: false },
            { key: 'deliveryApproved', type: 'boolean', required: true, default: false },
            { key: 'dryRun', type: 'boolean', required: true, default: true }
        ],
        inputs: { deliveryApproved: { value: false }, dryRun: { value: true } },
        filters: { events: [{ id: 'auth:account_create', type: 'events' }], filter_test_accounts: true }
    };
}
