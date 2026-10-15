import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    package_id: z.string(),
    document_number: z.string(),
    phone: z.string(),
    birth_date: z.string(),
    check_legal: z.boolean().optional(),
    extra: z.record(z.string(), z.unknown()).optional()
});
type Input = z.infer<typeof InputSchema>;
const OutputSchema = z.object({ data: z.unknown() });
type Output = z.infer<typeof OutputSchema>;

const action = createAction({
    description: 'Creates a Belender SMS verification request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/sms', group: 'SMS' },
    input: InputSchema,
    output: OutputSchema,
    exec: async (nango, input: Input): Promise<Output> => {
        const { extra, ...rest } = input;
        const response = await nango.post({
            endpoint: '/requests/sms',
            data: { ...(extra ?? {}), ...rest }
        });
        return { data: response.data };
    }
});
export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
