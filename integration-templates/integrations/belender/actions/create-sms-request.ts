import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    package_id: z.string().uuid(),
    document_number: z.string(),
    phone: z.string(),
    birth_date: z.string().describe('Birth date (YYYY-MM-DD).'),
    check_legal: z.boolean().optional(),
    extra: z.record(z.string(), z.unknown()).optional()
});

const OutputSchema = z.object({
    data: z.unknown()
});

const action = createAction({
    description: 'Creates a Belender SMS verification request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/sms', group: 'SMS' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const { extra, ...rest } = input;
        const response = await nango.post({
            endpoint: '/requests/sms',
            data: { ...rest, ...(extra ?? {}) },
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
