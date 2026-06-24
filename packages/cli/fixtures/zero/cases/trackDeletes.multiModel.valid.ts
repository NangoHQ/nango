import { createSync } from 'nango';
import * as z from 'zod';

const modelA = z.object({
    id: z.string()
});

const modelB = z.object({
    id: z.string()
});

export default createSync({
    description: 'example',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example', group: 'Issues' }],
    frequency: 'every hour',
    syncType: 'full',
    models: {
        ModelA: modelA,
        ModelB: modelB
    },
    exec: async (nango) => {
        await nango.trackDeletesStart('ModelA');
        await nango.batchSave([{ id: '1' }], 'ModelA');
        await nango.trackDeletesEnd('ModelA');

        await nango.trackDeletesStart('ModelB');
        await nango.batchSave([{ id: '2' }], 'ModelB');
        await nango.trackDeletesEnd('ModelB');
    }
});
