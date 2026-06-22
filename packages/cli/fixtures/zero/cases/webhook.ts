import { createWebhook } from 'nango';

export default createWebhook({
    name: 'contacts-updated',
    description: 'Handle contact updates',
    version: '1.0.0',
    debounce: { key: { body: '$.portalId' }, windowMs: 5000 },
    exec: async (nango) => {
        await nango.log('received webhook');
    }
});
