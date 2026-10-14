import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({ request_id: z.string() });
type Input = z.infer<typeof InputSchema>;
const OutputSchema = z.object({
    request_id: z.string(),
    data: z.unknown()
});
type Output = z.infer<typeof OutputSchema>;

const action = createAction({
    description: 'Fetches Belender standardized fast-json for a request (AEAT / SS payloads).',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/requests/fast-json', group: 'Documents' },
    input: InputSchema,
    output: OutputSchema,
    exec: async (nango, input: Input): Promise<Output> => {
        const response = await nango.get({
            endpoint: `/requests/${input.request_id}/fast-json`,
            retries: 3
        });
        return { request_id: input.request_id, data: response.data };
    }
});
export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
