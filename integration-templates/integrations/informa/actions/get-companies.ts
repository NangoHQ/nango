import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    denominacion: z.string().describe('Company name / denomination search string.'),
    extra: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe('Additional Informa query params allowed by your contract.')
});

const OutputSchema = z.object({
    data: z.unknown().describe('Raw Informa lista_empresas (or contract-specific) response.')
});

const action = createAction({
    description: 'Searches Informa companies by denomination / name (get-companies).',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/companies', group: 'Search' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const params: Record<string, string | number | boolean> = {
            denominacion: input.denominacion,
            ...(input.extra ?? {})
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
