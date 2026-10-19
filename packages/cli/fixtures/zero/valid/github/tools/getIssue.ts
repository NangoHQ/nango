import { createTool } from 'nango';
import * as z from 'zod';

const tool = createTool({
    name: 'get_issue',
    description: 'Get a GitHub issue',
    input: z.object({ issueNumber: z.number() }),
    output: z.object({ title: z.string() }),
    meta: {
        instructions: 'Use it to read a single issue. Search first when you only know the title.',
        requiredScopes: ['repo'],
        tags: { domain: 'issues' }
    },
    exec: async (nango, trigger) => {
        const issue = await nango.get<{ title: string }>({ endpoint: `/repos/NangoHQ/nango/issues/${trigger.input.issueNumber}` });
        return { title: issue.title };
    }
});

export default tool;
