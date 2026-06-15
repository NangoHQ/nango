import { createSync } from 'nango';
import * as z from 'zod';

const modelA = z.object({
    id: z.string()
});

export default createSync({
    description: 'example',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example', group: 'Issues' }],
    frequency: 'every hour',
    syncType: 'full',
    models: {
        ModelA: modelA
    },
    exec: async (nango) => {
        await nango.batchSave([{ id: '1' }], 'ModelA');
        await nango.trackDeletesStart('ModelA');
        await nango.trackDeletesEnd('ModelA');
    }
});
