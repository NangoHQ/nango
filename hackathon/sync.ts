import { z } from 'zod';
import { createSync } from './models.js';

const ticketSchema = z.object({ id: z.string(), name: z.string() });

// Sync
export default createSync({
    name: 'My Script',
    description: 'Hi this is a description',
    endpoint: { method: 'GET', path: '/my-script', group: 'My Group' },
    integrationId: 'unauthenticated',
    runs: 'every hour',
    autoStart: true,
    syncType: 'incremental',
    trackDeletes: true,
    models: {
        Ticket: ticketSchema
    },
    metadata: z.object({ foo: z.literal('bar') }),
    fetchData: async (nango) => {
        await nango.batchSave([{ id: '', name: '' }], 'Ticket');

        const meta = await nango.getMetadata();
        console.log(meta.foo);
        console.log(meta.bar);
    }
});

// No metadata
createSync({
    name: 'My Script',
    description: 'Hi this is a description',
    endpoint: { method: 'GET', path: '/my-script', group: 'My Group' },
    integrationId: 'unauthenticated',
    runs: 'every 1hour',
    autoStart: true,
    syncType: 'incremental',
    trackDeletes: true,

    models: {
        Ticket: ticketSchema
    },

    fetchData: async (nango) => {
        await nango.batchSave([{ id: '', name: '' }], 'Ticket');

        const meta = await nango.getMetadata();
        console.log(meta.foo);
        console.log(meta.bar);
        console.log(meta['foo']);
    }
});

// No metadata
createSync({
    name: 'My Script',
    description: 'Hi this is a description',
    endpoint: { method: 'GET', path: '/my-script', group: 'My Group' },
    integrationId: 'unauthenticated',
    runs: 'every 1hour',
    syncType: 'incremental',
    models: { Ticket: ticketSchema },
    fetchData: async () => {
        //
    },
    onWebhook: async (nango, payload) => {
        await nango.log('top', payload);
    }
});
