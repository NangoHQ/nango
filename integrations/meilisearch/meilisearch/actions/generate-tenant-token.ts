import { createAction } from 'nango';
import * as z from 'zod';

import { searchRulesSchema } from '../lib/schemas.js';
import { generateTenantToken } from '../lib/tenant-token.js';

const DEFAULT_TTL_SECONDS = 3600;

const input = z.object({
    searchRules: searchRulesSchema,
    expiresAt: z.number().optional().describe('Expiry as epoch seconds. Takes precedence over expiresInSeconds.'),
    expiresInSeconds: z.number().optional().describe('Expiry as a duration from now. Defaults to 3600 (1 hour) when neither field is set.'),
    apiKeyUid: z
        .string()
        .optional()
        .describe('The uid of the signing API key. When omitted, it is resolved via GET /keys/{apiKey}, which requires the keys.get action.')
});

const output = z.object({
    token: z.string(),
    expiresAt: z.number()
});

const action = createAction({
    description:
        'Generate a Meilisearch tenant token: a scoped, signed search JWT carrying per-index ACL rules. Expires after 1 hour unless expiresAt or expiresInSeconds is set.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/tenant-token', group: 'Tenant Tokens' },
    input,
    output,

    exec: async (nango, input) => {
        if (Object.keys(input.searchRules).length === 0) {
            throw new nango.ActionError({ message: 'searchRules must define at least one index rule.' });
        }

        const credentials = await nango.getToken();
        if (typeof credentials === 'string' || !('apiKey' in credentials)) {
            throw new nango.ActionError({ message: 'Meilisearch connection must use API_KEY auth to mint tenant tokens.' });
        }
        const apiKey = credentials.apiKey;

        let apiKeyUid = input.apiKeyUid;
        if (!apiKeyUid) {
            try {
                const res = await nango.get<{ uid: string }>({ endpoint: `/keys/${encodeURIComponent(apiKey)}` });
                apiKeyUid = res.data.uid;
            } catch {
                throw new nango.ActionError({
                    message:
                        'Could not resolve the API key uid via GET /keys/{apiKey}. This requires a key with the keys.get action (a 404 means the connection uses the master key, which cannot sign tenant tokens). Either connect with a key that has keys.get, or pass apiKeyUid explicitly.'
                });
            }
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const expiresAt = input.expiresAt ?? nowSeconds + (input.expiresInSeconds ?? DEFAULT_TTL_SECONDS);

        const token = generateTenantToken({
            apiKey,
            apiKeyUid,
            searchRules: input.searchRules,
            expiresAt
        });

        return { token, expiresAt };
    }
});

export default action;
