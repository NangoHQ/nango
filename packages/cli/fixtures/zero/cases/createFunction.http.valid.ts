import { createFunction } from 'nango/experimental';
import * as z from 'zod';

export default createFunction({
    description: 'HTTP trigger dry-run fixture',
    trigger: { kind: 'http', subscriptions: ['issues.opened', 'issues.closed'] },
    input: z.object({ id: z.string() }),
    output: z.object({ input: z.unknown().optional(), request: z.unknown().optional(), subscriptions: z.array(z.string()).nullable() }),
    exec: (_nango, trigger) => ({ input: trigger.input, request: trigger.request, subscriptions: trigger.subscriptions ?? null })
});
