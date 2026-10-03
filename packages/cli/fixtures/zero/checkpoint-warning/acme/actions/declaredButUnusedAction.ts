import { createAction } from 'nango';
import * as z from 'zod';

export default createAction({
    description: 'Declares a checkpoint schema but never calls the checkpoint API -- should trigger the compile-time warning.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/example/declared-but-unused-action', group: 'Issues' },
    input: z.void(),
    output: z.void(),
    checkpoint: z.object({
        lastSyncedIssueId: z.string()
    }),
    exec: async (nango) => {
        await nango.proxy({ endpoint: `/nangohq/nango/issues`, method: 'GET' });
    }
});
