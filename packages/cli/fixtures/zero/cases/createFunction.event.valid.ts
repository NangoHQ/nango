import { createFunction } from 'nango/experimental';
import * as z from 'zod';

export default createFunction({
    description: 'Event dry-run fixture',
    trigger: { kind: 'event', events: ['post-connection-creation', 'pre-connection-deletion'] },
    output: z.object({ kind: z.literal('event'), event: z.string() }),
    exec: async (_nango, trigger) => ({ kind: trigger.kind, event: trigger.input.event })
});
