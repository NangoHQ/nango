import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    params: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe('Optional Informa query params to select decoding tables.')
});

const OutputSchema = z.object({
    data: z.unknown().describe('Raw Informa decoding tables payload.')
});

const action = createAction({
    description: 'Fetches Informa decoding tables for coded fields (get-tables).',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/tables', group: 'Reference' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.get({
            endpoint: '/api/get-tables',
            params: input.params ?? {},
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
