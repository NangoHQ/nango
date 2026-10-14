import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.union([z.string(), z.number()])
});

const OutputSchema = z.object({
    data: z.unknown()
});

const action = createAction({
    description: 'Resends the OTP for a Belender SMS request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/sms/resend-otp', group: 'SMS' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.post({
            endpoint: '/requests/sms/resend-otp',
            data: { request_id: input.request_id },
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
