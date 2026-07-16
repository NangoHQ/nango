import { createFunction } from 'nango/experimental';
import * as z from 'zod';

export default createFunction({
    description: 'example experimental function',
    input: z.object({ id: z.string() }),
    output: z.void(),
    exec: async (nango, trigger) => {
        await nango.log(`running for ${trigger.input.id}`);
        await nango.proxy({ endpoint: '/repos/NangoHQ/nango/issues' });
    }
});
