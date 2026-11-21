import { createFunction } from 'nango/experimental';
import * as z from 'zod';

export default createFunction({
    description: 'Replay a native HTTP function',
    trigger: { kind: 'http' },
    input: z.object({ id: z.string() }),
    output: z.object({
        title: z.string(),
        responseStatus: z.number(),
        responseRequestId: z.string(),
        method: z.string(),
        path: z.string(),
        event: z.string(),
        source: z.string(),
        connectionId: z.string(),
        subscriptions: z.array(z.string())
    }),
    exec: async (nango, trigger) => {
        const issue = await nango.get<{ title: string }>({ endpoint: `/issues/${trigger.input.id}` });
        return {
            title: issue.data.title,
            responseStatus: issue.status,
            responseRequestId: String(issue.headers['x-request-id'] ?? ''),
            method: trigger.request.method,
            path: trigger.request.path,
            event: trigger.request.headers['x-event'] ?? '',
            source: trigger.request.query['source'] ?? '',
            connectionId: trigger.connection?.connectionId ?? '',
            subscriptions: trigger.subscriptions ?? []
        };
    }
});
