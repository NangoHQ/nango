import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.union([z.string(), z.number()]),
    code: z.string()
});

const OutputSchema = z.object({
    data: z.unknown()
});

const action = createAction({
    description: 'Submits an OTP for a Belender SMS request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/sms/otp', group: 'SMS' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.post({
            endpoint: '/requests/sms/otp',
            data: { request_id: input.request_id, code: input.code },
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
