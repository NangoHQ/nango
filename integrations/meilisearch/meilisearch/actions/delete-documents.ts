import { createAction } from 'nango';
import * as z from 'zod';

import { enqueuedTaskSchema, filterSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    ids: z
        .array(z.union([z.string(), z.number()]))
        .min(1)
        .optional(),
    filter: filterSchema.optional()
});

const action = createAction({
    description: 'Delete documents from a Meilisearch index by ids or by filter (exactly one must be provided). Returns the enqueued task.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents/delete', group: 'Documents' },
    input,
    output: enqueuedTaskSchema,

    exec: async (nango, input) => {
        // Enforced here because action input is not validated at runtime.
        const hasIds = input.ids !== undefined;
        const hasFilter = input.filter !== undefined;
        if (hasIds === hasFilter) {
            throw new nango.ActionError({ message: 'Provide exactly one of "ids" or "filter".' });
        }
        if (hasIds && input.ids!.length === 0) {
            throw new nango.ActionError({ message: '"ids" must contain at least one document id.' });
        }

        const res = hasIds
            ? await nango.post({ endpoint: `/indexes/${encodeURIComponent(input.indexUid)}/documents/delete-batch`, data: input.ids })
            : await nango.post({ endpoint: `/indexes/${encodeURIComponent(input.indexUid)}/documents/delete`, data: { filter: input.filter } });
        return res.data;
    }
});

export default action;
