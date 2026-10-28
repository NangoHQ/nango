import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    denominacion: z.string().describe('Company name / denomination search string.'),
    extra: z.record(z.string(), z.string()).optional().describe('Additional Informa query params as strings.')
});

type Input = z.infer<typeof InputSchema>;

const OutputSchema = z.object({
    data: z.unknown()
});

type Output = z.infer<typeof OutputSchema>;

const action = createAction({
    description: 'Searches Informa companies by denomination / name (get-companies).',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/companies', group: 'Search' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input: Input): Promise<Output> => {
        const params: Record<string, string> = {
            ...(input.extra ?? {}),
            denominacion: input.denominacion
        };

        const response = await nango.get({
            endpoint: '/api/get-companies',
            params,
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
