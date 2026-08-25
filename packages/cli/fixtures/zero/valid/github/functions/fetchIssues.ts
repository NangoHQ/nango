import { createFunction } from 'nango/experimental';
import * as z from 'zod';

export default createFunction({
    description: 'Fetch a GitHub issue on demand',
    input: z.object({ issueNumber: z.number() }),
    output: z.object({ id: z.string(), title: z.string(), state: z.string() }),
    exec: async (nango, trigger) => {
        const issue = await nango.get<{ id: number; title: string; state: string }>({
            endpoint: `/repos/NangoHQ/nango/issues/${trigger.input.issueNumber}`
        });
        return { id: String(issue.id), title: issue.title, state: issue.state };
    }
});
