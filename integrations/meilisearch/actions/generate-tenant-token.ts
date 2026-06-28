import { createAction } from 'nango';
import * as z from 'zod';

import { searchRulesSchema } from '../lib/schemas.js';
import { generateTenantToken } from '../lib/tenant-token.js';

const input = z
    .object({
        searchRules: searchRulesSchema,
        expiresAt: z.number().optional(),
        expiresInSeconds: z.number().optional(),
        apiKeyUid: z.string().optional()
    })
    .refine((v) => Object.keys(v.searchRules).length > 0, { message: 'searchRules must define at least one index rule' });

const output = z.object({
    token: z.string(),
    expiresAt: z.number().nullable()
});

const action = createAction({
    description: 'Generate a Meilisearch tenant token: a scoped, signed search JWT carrying per-index ACL rules.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/tenant-token', group: 'Tenant Tokens' },
    input,
    output,

    exec: async (nango, input) => {
        const credentials = await nango.getToken();
        if (typeof credentials === 'string' || !('apiKey' in credentials)) {
            throw new nango.ActionError({ message: 'Meilisearch connection must use API_KEY auth to mint tenant tokens.' });
        }
        const apiKey = credentials.apiKey;

        let apiKeyUid = input.apiKeyUid;
        if (!apiKeyUid) {
            const res = await nango.get<{ uid: string }>({ endpoint: `/keys/${encodeURIComponent(apiKey)}` });
            apiKeyUid = res.data.uid;
        }

        let expiresAt: number | null = null;
        if (input.expiresAt !== undefined) {
            expiresAt = input.expiresAt;
        } else if (input.expiresInSeconds !== undefined) {
            expiresAt = Math.floor(Date.now() / 1000) + input.expiresInSeconds;
        }

        const token = generateTenantToken({
            apiKey,
            apiKeyUid,
            searchRules: input.searchRules,
            ...(expiresAt !== null ? { expiresAt } : {})
        });

        return { token, expiresAt };
    }
});

export default action;
