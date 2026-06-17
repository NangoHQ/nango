import { createWebhook } from 'nango';

export default createWebhook({
    description: '',
    // Runs synchronously at ingress to verify the request is authentic. No SDK, no I/O.
    // ingressValidation: async (event) => {
    //     return true;
    // },
    // Coalesce bursts of events into a single run.
    // debounce: { key: { body: '$.id' }, windowMs: 5000 },
    exec: async (nango, event) => {
        // Routing lives here, on your runner. Find the matching connection(s) and trigger work.
        await nango.log('Received webhook', event.payload);
    }
});
