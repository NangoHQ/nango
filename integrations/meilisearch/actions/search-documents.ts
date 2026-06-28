import { createAction } from 'nango';
import * as z from 'zod';

import { meiliDocumentSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    q: z.string().optional(),
    filter: z.union([z.string(), z.array(z.string())]).optional(),
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
    input,
    output,

    exec: async (nango, input) => {
        const { indexUid, ...body } = input;
        const res = await nango.post({ endpoint: `/indexes/${encodeURIComponent(indexUid)}/search`, data: body });
        return res.data;
    }
});

export default action;
