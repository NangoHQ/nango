import { createAction } from 'nango';
import { z } from 'zod';

const InputSchema = z.object({
    request_id: z.string(),
    document_id: z.string()
});
type Input = z.infer<typeof InputSchema>;
const OutputSchema = z.object({
    request_id: z.string(),
    document_id: z.string(),
    data: z.unknown()
});
type Output = z.infer<typeof OutputSchema>;

const action = createAction({
    description: 'Downloads a document produced by a Belender request.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/requests/documents', group: 'Documents' },
    input: InputSchema,
    output: OutputSchema,
    exec: async (nango, input: Input): Promise<Output> => {
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
