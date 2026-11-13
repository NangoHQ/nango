import { createSync } from 'nango';
import * as z from 'zod';

import { syncIssues } from './features.helper.checkpoint.js';

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
    exec: syncIssues
});
