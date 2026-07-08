import { createAction } from 'nango';
import * as z from 'zod';

import { filterSchema, meiliDocumentSchema } from '../lib/schemas.js';

// Loose: extra keys are forwarded to Meilisearch so callers can use any
// supported search param (e.g. hybrid, showRankingScore) without a schema change.
const inputSchema = z.looseObject({
    indexUid: z.string(),
    q: z.string().optional(),
    filter: filterSchema.optional(),
    sort: z.array(z.string()).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    attributesToRetrieve: z.array(z.string()).optional(),
    facets: z.array(z.string()).optional()
});

const output = z
    .object({
        hits: z.array(meiliDocumentSchema),
        query: z.string().optional(),
        processingTimeMs: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
        estimatedTotalHits: z.number().optional()
    })
    .catchall(z.unknown());

const action = createAction({
    description: 'Search documents in a Meilisearch index.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents/search', group: 'Documents' },
    input: inputSchema,
    output,

    exec: async (nango, rawInput) => {
        // Declared input schemas are not enforced at runtime; validate explicitly.
        const { data: input } = await nango.zodValidateInput({ zodSchema: inputSchema, input: rawInput });
        const { indexUid, ...body } = input;
        const res = await nango.post({ endpoint: `/indexes/${encodeURIComponent(indexUid)}/search`, data: body });
        return res.data;
    }
});

export default action;
