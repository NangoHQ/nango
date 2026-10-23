import { readFileSync } from 'node:fs';

export function configuration() {
    return {
        type: 'destination',
        name: 'X | Completed account signup | Backend OAuth adapter',
        description: 'Default-off prototype. Only the dedicated adapter bearer secret belongs in PostHog; X OAuth credentials remain on backend.',
        enabled: false,
        hog: readFileSync(new URL('./x-adapter.hog', import.meta.url), 'utf8'),
        inputs_schema: [
            { key: 'routeSecret', type: 'string', required: true, secret: true, templating: false },
            { key: 'deliveryApproved', type: 'boolean', required: true, default: false },
            { key: 'dryRun', type: 'boolean', required: true, default: true }
        ],
        inputs: { deliveryApproved: { value: false }, dryRun: { value: true } },
        filters: { events: [{ id: 'auth:account_create', type: 'events' }], filter_test_accounts: true }
    };
}
