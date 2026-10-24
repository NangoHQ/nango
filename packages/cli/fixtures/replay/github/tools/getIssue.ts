import { createTool } from 'nango';
import * as z from 'zod';

export default createTool({
    name: 'fetch_repository_issue_details',
    description: 'Replay a tool with a public name different from its filename',
    input: z.object({ id: z.string() }),
    output: z.object({ title: z.string(), source: z.string() }),
    exec: async (nango, trigger) => {
        const issue = await nango.get<{ title: string }>({ endpoint: `/issues/${trigger.input.id}` });
        return { title: issue.data.title, source: trigger.request.query['source'] ?? '' };
    }
});
