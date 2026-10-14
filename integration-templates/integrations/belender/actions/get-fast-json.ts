import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.union([z.string(), z.number()]).describe('Belender request id.')
});

const OutputSchema = z.object({
    request_id: z.union([z.string(), z.number()]),
    data: z.unknown().describe('Belender standardized JSON (e.g. AEAT / SS).')
});

const action = createAction({
    description: 'Fetches Belender standardized fast-json for a request (AEAT / SS payloads).',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/requests/fast-json', group: 'Documents' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.get({
            endpoint: `/requests/${input.request_id}/fast-json`,
            retries: 3
        });

        return { request_id: input.request_id, data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
