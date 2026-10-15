import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({ request_id: z.union([z.string(), z.number()]) });
type Input = z.infer<typeof InputSchema>;
const OutputSchema = z.object({ data: z.unknown() });
type Output = z.infer<typeof OutputSchema>;

const action = createAction({
    description: 'Resends the OTP for a Belender Cl@ve PIN request.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/clave-pin/resend-otp', group: 'Clave PIN' },
    input: InputSchema,
    output: OutputSchema,
    exec: async (nango, input: Input): Promise<Output> => {
        const response = await nango.post({
            endpoint: '/requests/clave-pin/resend-otp',
            data: input
        });
        return { data: response.data };
    }
});
export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
