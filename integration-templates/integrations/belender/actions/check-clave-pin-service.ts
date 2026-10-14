import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    document_number: z.string().describe('Spanish ID document number (DNI/NIE).'),
    document_expiration_date: z.string().describe('Document expiration date (YYYY-MM-DD).'),
    document_support: z.string().optional().describe('Support number required for NIE documents.')
});

const OutputSchema = z.object({
    data: z.unknown()
});

const action = createAction({
    description: 'Checks whether a person has Cl@ve PIN available in Belender.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/clave-pin/check-service', group: 'Clave PIN' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.post({
            endpoint: '/requests/clave-pin/check-service',
            data: {
                document_number: input.document_number,
                document_expiration_date: input.document_expiration_date,
                ...(input.document_support !== undefined ? { document_support: input.document_support } : {})
            },
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
