import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.union([z.string(), z.number()]),
    document_id: z.union([z.string(), z.number()]).describe('Document id produced by the Belender request.')
});

const OutputSchema = z.object({
    request_id: z.union([z.string(), z.number()]),
    document_id: z.union([z.string(), z.number()]),
    data: z.unknown().describe('Document payload from Belender (may be binary or nested JSON).')
});

const action = createAction({
    description: 'Downloads a document produced by a Belender request.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/requests/documents', group: 'Documents' },
    input: InputSchema,
    output: OutputSchema,

    exec: async (nango, input): Promise<z.infer<typeof OutputSchema>> => {
        const response = await nango.get({
            endpoint: `/requests/${input.request_id}/documents/${input.document_id}`,
            retries: 3
        });

        return {
            request_id: input.request_id,
            document_id: input.document_id,
            data: response.data
        };
    }
});

export type NangoActionLocal = Parameters<(typeof action)['exec']>[0];
export default action;
