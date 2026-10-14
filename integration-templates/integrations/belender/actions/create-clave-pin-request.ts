import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    package_id: z.string().uuid().describe('Belender package UUID for this environment (QA vs prod).'),
    document_number: z.string(),
    document_expiration_date: z.string(),
    check_legal: z.boolean().optional().describe('Whether to run legal checks. Defaults depend on Belender.'),
    document_support: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional().describe('Additional JSON fields accepted by Belender.')
});

const OutputSchema = z.object({
    data: z.unknown()
});

const action = createAction({
    description: 'Creates a Belender Cl@ve PIN request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/clave-pin', group: 'Clave PIN' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const { extra, ...rest } = input;
        const response = await nango.post({
            endpoint: '/requests/clave-pin',
            data: { ...rest, ...(extra ?? {}) },
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
