import { createAction } from 'nango';
import { z } from 'zod';

const issueSchema = z.object({
    id: z.string(),
    owner: z.string(),
    repo: z.string(),
    issue_number: z.number(),
    title: z.string(),
    state: z.string(),
    author: z.string(),
    author_id: z.number(),
    body: z.string(),
    date_created: z.string(),
    date_last_modified: z.string()
});

export default createAction({
    description: `Create an issue in GitHub`,
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/example/github/issues', group: 'Issues' },
    input: issueSchema,
    output: z.void(),

    // Action execution
    exec: async (nango, input) => {
        await nango.proxy({
            endpoint: '/repos/NangoHQ/interactive-demo/issues',
            data: {
                title: `[demo] ${input.title}`,
                body: `This issue was created automatically using Nango Action.`,
                labels: ['automatic']
            }
        });
    }
});
