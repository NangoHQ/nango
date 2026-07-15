import { normalize } from '@repo/shared';
import { createSync } from 'nango';
import * as z from 'zod';

export default createSync({
    description: 'imports a workspace package',
    version: '1.0.0',
    endpoints: [{ method: 'GET', path: '/example', group: 'Issues' }],
    frequency: 'every hour',
    syncType: 'full',
    models: {
        GithubIssue: z.object({ id: z.string() })
    },
    exec: async (nango) => {
        await nango.log(normalize('  HELLO  '));
    }
});
