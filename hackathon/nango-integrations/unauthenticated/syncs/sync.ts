import { z } from 'zod';
import { createSync } from '../../tmp.js';

const ticketSchema = z.object({ id: z.string(), name: z.string() });

// Sync
export default createSync({
    description: 'Hi this is a description',
    endpoints: [{ method: 'GET', path: '/my-script', group: 'My Group' }],
    integrationId: 'unauthenticated',
    runs: 'every hour',
    autoStart: true,
    syncType: 'incremental',
    trackDeletes: true,
    models: {
        Ticket: ticketSchema
    },
    metadata: z.object({
        foo: z.literal('bar'),
        num: z.number(),
        bool: z.boolean(),
        null: z.null(),
        enum: z.enum(['tip', 'top']),
        arr: z.array(z.string()),
        obj: z.object({ bar: z.string() }),
        union: z.union([z.string(), z.boolean()]),
        any: z.any(),
        reco: z.record(z.string(), z.date())
    }),
    exec: async (nango) => {
        await nango.batchSave([{ id: 'foobar', name: '' }], 'Ticket');

        const meta = await nango.getMetadata();
        console.log(meta.foo);
        console.log(meta.bar);
    }
});

// No metadata
createSync({
    description: 'Hi this is a description',
    endpoints: [{ method: 'GET', path: '/my-script', group: 'My Group' }],
    integrationId: 'unauthenticated',
    runs: 'every 1hour',
    autoStart: true,
    syncType: 'incremental',
    trackDeletes: true,

    models: {
        Ticket: ticketSchema
    },

    exec: async (nango) => {
        await nango.batchSave([{ id: '', name: '' }], 'Ticket');

        const meta = await nango.getMetadata();
        console.log(meta.foo);
        console.log(meta.bar);
        console.log(meta['foo']);
    }
});

// Webhook
createSync({
    description: 'Hi this is a description',
    endpoints: [{ method: 'GET', path: '/my-script', group: 'My Group' }],
    integrationId: 'unauthenticated',
    runs: 'every 1hour',
    syncType: 'incremental',
    models: { Ticket: ticketSchema },
    exec: async () => {
        //
    },
    onWebhook: async (nango, payload) => {
        await nango.log('top', payload);
    }
});
