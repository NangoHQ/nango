import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.union([z.string(), z.number()]),
    terms_and_conditions: z.boolean()
});

const OutputSchema = z.object({
    data: z.unknown()
});

const action = createAction({
    description: 'Accepts terms for a Belender SMS request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/sms/terms', group: 'SMS' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.post({
            endpoint: '/requests/sms/terms',
            data: {
                request_id: input.request_id,
                terms_and_conditions: input.terms_and_conditions
            },
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
