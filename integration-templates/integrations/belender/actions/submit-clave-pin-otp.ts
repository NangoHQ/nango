import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.union([z.string(), z.number()]),
    code: z.string().describe('OTP code (AEAT or Social Security step).')
});

const OutputSchema = z.object({
    data: z.unknown()
});

const action = createAction({
    description: 'Submits an OTP for a Belender Cl@ve PIN request (AEAT / SS steps).',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/clave-pin/otp', group: 'Clave PIN' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.post({
            endpoint: '/requests/clave-pin/otp',
            data: { request_id: input.request_id, code: input.code },
            retries: 3
        });

        return { data: response.data };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
