import { createAction } from 'nango';
import * as z from 'zod';

import { enqueuedTaskSchema } from '../lib/schemas.js';

const input = z
    .object({
        indexUid: z.string(),
        ids: z.array(z.union([z.string(), z.number()])).optional(),
        filter: z.union([z.string(), z.array(z.string())]).optional()
    })
    .refine((v) => (v.ids === undefined) !== (v.filter === undefined), {
        message: 'Provide exactly one of "ids" or "filter".'
    });

const action = createAction({
    description: 'Delete documents from a Meilisearch index by ids or by filter. Returns the enqueued task.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents/delete', group: 'Documents' },
    input,
    output: enqueuedTaskSchema,

    exec: async (nango, input) => {
        const res = input.ids
            ? await nango.post({ endpoint: `/indexes/${encodeURIComponent(input.indexUid)}/documents/delete-batch`, data: input.ids })
            : await nango.post({ endpoint: `/indexes/${encodeURIComponent(input.indexUid)}/documents/delete`, data: { filter: input.filter } });
        return res.data;
    }
});

export default action;
