import { createAction } from 'nango';
import * as z from 'zod';

const inputSchema = z.object({
    taskUid: z.number()
});

const output = z
    .object({
        uid: z.number(),
        indexUid: z.string().nullable(),
        status: z.string(),
        type: z.string(),
        error: z.unknown().nullable().optional(),
        enqueuedAt: z.string(),
        startedAt: z.string().nullable().optional(),
        finishedAt: z.string().nullable().optional()
    })
    .catchall(z.unknown());

const action = createAction({
    description: 'Fetch the status of a Meilisearch async task by its uid.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/meilisearch/tasks', group: 'Tasks' },
    input: inputSchema,
    output,

    exec: async (nango, rawInput) => {
        // Declared input schemas are not enforced at runtime; validate explicitly.
        const { data: input } = await nango.zodValidateInput({ zodSchema: inputSchema, input: rawInput });
        const res = await nango.get({ endpoint: `/tasks/${input.taskUid}` });
        return res.data;
    }
});

export default action;
