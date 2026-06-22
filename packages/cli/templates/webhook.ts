import { createWebhook } from 'nango';

export default createWebhook({
    description: '',
    // Declarative ingress checks. You select the scheme; Nango verifies the request at ingress.
    // ingress: {
    //     validation: { type: 'hmac', algorithm: 'sha256', header: 'x-signature', encoding: 'hex', secret: { source: 'integrationConfig', key: 'webhookSecret' } }
    // },
    // Coalesce bursts of events into a single run.
    // debounce: { key: { body: '$.id' }, windowMs: 5000 },
    exec: async (nango, event) => {
        // Routing lives here, on your runner. Find the matching connection(s) and trigger work.
        await nango.log('Received webhook', event.request.body);
    }
});
