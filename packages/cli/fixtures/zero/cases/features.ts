import { createSync } from 'nango';
import * as z from 'zod';

const issueSchema = z.object({
    id: z.string()
});

export default createSync({
    description: 'example',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example', group: 'Issues' }],
    frequency: 'every hour',
    syncType: 'full',
    models: {
        GithubIssue: issueSchema
    },
    checkpoint: z.object({
        lastSyncedIssueId: z.string()
    }),
    exec: async (nango) => {
        const checkpoint = await nango.getCheckpoint();
        const from = checkpoint ? `from=checkpoint.lastSyncedIssueId` : '';
        await nango.get({ endpoint: `/nangohq/nango/issues?${from}` });
        await nango.saveCheckpoint({ lastSyncedIssueId: '123' });
    }
});
