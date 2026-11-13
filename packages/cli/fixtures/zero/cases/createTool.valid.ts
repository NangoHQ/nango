import { createTool, scopes } from 'nango';
import * as z from 'zod';

export default createTool({
    description: 'example tool',
    input: z.object({ id: z.string() }),
    output: z.object({ ok: z.boolean() }),
    meta: { instructions: 'Use it to check an issue', requiredScopes: scopes.all('repo') },
    exec: async (nango, trigger) => {
        await nango.log(`running for ${trigger.input.id}`);
        return { ok: true };
    }
});
