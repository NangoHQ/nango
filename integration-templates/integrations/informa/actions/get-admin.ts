import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    params: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .describe('Informa administrator search query params for your contract (name fields, etc.).')
});

const OutputSchema = z.object({
    data: z.unknown().describe('Raw Informa get-admin response (person → related companies).')
});

const action = createAction({
    description: 'Searches Informa administrators and related companies (get-admin).',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/admin', group: 'Search' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.get({
            endpoint: '/api/get-admin',
            params: input.params,
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
