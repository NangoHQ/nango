import { createWebhook } from 'nango';

export default createWebhook({
    description: '',
    // Ordered hooks that run synchronously at ingress. No SDK, no I/O.
    // Throw to reject (401), return a response to short-circuit (handshake), or return nothing to proceed.
    // ingressHooks: [
    //     async (event) => {
    //         if (!isAuthentic(event)) throw new Error('invalid signature');
    //     }
    // ],
    // Coalesce bursts of events into a single run.
    // debounce: { key: { body: '$.id' }, windowMs: 5000 },
    exec: async (nango, event) => {
        // Routing lives here, on your runner. Find the matching connection(s) and trigger work.
        await nango.log('Received webhook', event.payload);
    }
});
