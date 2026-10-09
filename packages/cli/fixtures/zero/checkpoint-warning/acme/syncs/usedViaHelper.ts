import { createSync } from 'nango';
import * as z from 'zod';

import { execWithCheckpoint } from './helper.js';

const issueSchema = z.object({
    id: z.string()
});

export default createSync({
    description: 'Declares a checkpoint schema and calls the checkpoint API from an imported helper -- should NOT trigger the compile-time warning.',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example/used-via-helper', group: 'Issues' }],
    frequency: 'every hour',
    syncType: 'full',
    models: {
        HelperIssue: issueSchema
    },
    checkpoint: z.object({
        lastSyncedIssueId: z.string()
    }),
    exec: execWithCheckpoint
});
