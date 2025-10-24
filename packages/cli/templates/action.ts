import { createAction } from 'nango';
import * as z from 'zod';

const action = createAction({
    description: ``,
    version: '1.0.0',
    endpoint: { method: 'POST', path: '', group: '' },
    input: z.void(),
    output: z.void(),

    exec: async (nango, input) => {
        // implement action logic here
        await nango.log(input);
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
