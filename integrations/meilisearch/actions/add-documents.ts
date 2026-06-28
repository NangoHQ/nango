import { createAction } from 'nango';
import * as z from 'zod';

import { enqueuedTaskSchema, meiliDocumentSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    documents: z.array(meiliDocumentSchema).min(1),
    primaryKey: z.string().optional()
});

const action = createAction({
    description: 'Add or replace documents in a Meilisearch index (batch). Returns the enqueued task.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents', group: 'Documents' },
    input,
    output: enqueuedTaskSchema,

    exec: async (nango, input) => {
        const res = await nango.post({
            endpoint: `/indexes/${input.indexUid}/documents`,
            data: input.documents,
            ...(input.primaryKey ? { params: { primaryKey: input.primaryKey } } : {})
        });
        return res.data;
    }
});

export default action;
