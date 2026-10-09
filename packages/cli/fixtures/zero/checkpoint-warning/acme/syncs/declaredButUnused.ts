import { createSync } from 'nango';
import * as z from 'zod';

const issueSchema = z.object({
    id: z.string()
});

export default createSync({
    description: 'Declares a checkpoint schema but never calls the checkpoint API -- should trigger the compile-time warning.',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example/declared-but-unused', group: 'Issues' }],
    frequency: 'every hour',
    syncType: 'full',
    models: {
        GithubIssue: issueSchema
    },
    checkpoint: z.object({
        lastSyncedIssueId: z.string()
    }),
    exec: async (nango) => {
        await nango.get({ endpoint: `/nangohq/nango/issues` });
    }
});
