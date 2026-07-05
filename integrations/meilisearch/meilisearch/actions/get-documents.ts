import { createAction } from 'nango';
import * as z from 'zod';

import { filterSchema, meiliDocumentSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    ids: z.array(z.union([z.string(), z.number()])).optional(),
    filter: filterSchema.optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().optional(),
    offset: z.number().optional()
});

const output = z
    .object({
        results: z.array(meiliDocumentSchema),
        total: z.number(),
        limit: z.number(),
        offset: z.number()
    })
    .catchall(z.unknown());

const action = createAction({
    description: 'Fetch documents from a Meilisearch index, optionally filtered.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents/fetch', group: 'Documents' },
    input,
    output,

    exec: async (nango, input) => {
        const { indexUid, ...body } = input;
        const res = await nango.post({ endpoint: `/indexes/${encodeURIComponent(indexUid)}/documents/fetch`, data: body });
        return res.data;
    }
});

export default action;
