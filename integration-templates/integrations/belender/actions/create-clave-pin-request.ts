import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    package_id: z.string(),
    document_number: z.string(),
    document_expiration_date: z.string(),
    check_legal: z.boolean().optional(),
    document_support: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional()
});
type Input = z.infer<typeof InputSchema>;
const OutputSchema = z.object({ data: z.unknown() });
type Output = z.infer<typeof OutputSchema>;

const action = createAction({
    description: 'Creates a Belender Cl@ve PIN request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/clave-pin', group: 'Clave PIN' },
    input: InputSchema,
    output: OutputSchema,
    exec: async (nango, input: Input): Promise<Output> => {
        const { extra, ...rest } = input;
        const response = await nango.post({
            endpoint: '/requests/clave-pin',
            data: { ...(extra ?? {}), ...rest }
        });
        return { data: response.data };
    }
});
export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
