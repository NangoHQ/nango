import { createFunction } from 'nango/experimental';
import * as z from 'zod';

export default createFunction({
    description: 'Scheduled dry-run fixture',
    trigger: { kind: 'schedule', frequency: 'every day' },
    output: z.object({ kind: z.literal('schedule'), input: z.null() }),
    exec: async (_nango, trigger) => ({ kind: trigger.kind, input: trigger.input })
});
