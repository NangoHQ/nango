import { createSync } from 'nango';
import * as z from 'zod';

const issueSchema = z.object({
    id: z.string(),
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
    exec: async (nango) => {
        await nango.get({ endpoint: '/nangohq/nango/issues' });
        await nango.setMergingStrategy({ strategy: 'ignore_if_modified_after' }, 'GithubIssue');
    },
});