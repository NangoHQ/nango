import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.string(),
    code: z.string()
});
type Input = z.infer<typeof InputSchema>;
const OutputSchema = z.object({ data: z.unknown() });
type Output = z.infer<typeof OutputSchema>;

const action = createAction({
    description: 'Submits an OTP for a Belender SMS request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/sms/otp', group: 'SMS' },
    input: InputSchema,
    output: OutputSchema,
    exec: async (nango, input: Input): Promise<Output> => {
        const response = await nango.post({
            endpoint: '/requests/sms/otp',
            data: input,
            retries: 3
        });
        return { data: response.data };
    }
});
export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
