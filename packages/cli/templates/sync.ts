import { createSync } from 'nango';
import * as z from 'zod';

const sync = createSync({
    description: '',
    version: '',
    endpoints: [{ method: 'GET', path: '', group: '' }],
    frequency: '',
    syncType: 'incremental', // or 'full'

    metadata: z.void(),
    models: {
    },

    exec: async (nango) => {
        // implement sync logic here
        await nango.log('Hello world!');
    },

    /**
    // Webhook handler
    onWebhook: async (nango, payload) => {
    }
    */
});

export type NangoSyncLocal = Parameters<(typeof sync)['exec']>[0];
export default sync;
