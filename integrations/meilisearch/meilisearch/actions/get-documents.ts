import { createAction } from 'nango';
import * as z from 'zod';

import { filterSchema, meiliDocumentSchema } from '../lib/schemas.js';

// Loose: extra keys are forwarded to Meilisearch so callers can use any
// supported fetch param without a schema change.
const inputSchema = z.looseObject({
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
    input: inputSchema,
    output,

    exec: async (nango, rawInput) => {
        // Declared input schemas are not enforced at runtime; validate explicitly.
        const { data: input } = await nango.zodValidateInput({ zodSchema: inputSchema, input: rawInput });
        const { indexUid, ...body } = input;
        const res = await nango.post({ endpoint: `/indexes/${encodeURIComponent(indexUid)}/documents/fetch`, data: body });
        return res.data;
    }
});

export default action;
