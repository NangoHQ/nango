import { createAction } from 'nango';
import * as z from 'zod';

import { searchRulesSchema } from '../lib/schemas.js';
import { generateTenantToken } from '../lib/tenant-token.js';

const DEFAULT_TTL_SECONDS = 3600;
const KEYS_PAGE_SIZE = 100;
const MAX_KEY_PAGES = 20;

const input = z.object({
    searchRules: searchRulesSchema,
    expiresAt: z.number().optional().describe('Expiry as epoch seconds. Takes precedence over expiresInSeconds.'),
    expiresInSeconds: z.number().optional().describe('Expiry as a duration from now. Defaults to 3600 (1 hour) when neither field is set.'),
    apiKeyUid: z
        .string()
        .optional()
        .describe('The uid of the signing API key. When omitted, it is resolved by listing keys, which requires the keys.get action.')
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
        // Parsed here because action input is not validated at runtime; a malformed
        // rule (e.g. a typo'd "filters" key) would otherwise be signed into the token
        // and silently ignored by Meilisearch, broadening access.
        const parsedRules = searchRulesSchema.safeParse(input.searchRules);
        if (!parsedRules.success) {
            throw new nango.ActionError({ message: `Invalid searchRules: ${parsedRules.error.issues.map((i) => i.message).join('; ')}` });
        }
        const searchRules = parsedRules.data;
        if (Object.keys(searchRules).length === 0) {
            throw new nango.ActionError({ message: 'searchRules must define at least one index rule.' });
        }

        const credentials = await nango.getToken();
        if (typeof credentials === 'string' || !('apiKey' in credentials)) {
            throw new nango.ActionError({ message: 'Meilisearch connection must use API_KEY auth to mint tenant tokens.' });
        }
        const apiKey = credentials.apiKey;

        let apiKeyUid = input.apiKeyUid;
        if (!apiKeyUid) {
            // Resolve the key's uid by listing keys and matching locally: GET /keys/{key}
            // would put the raw key in the URL path, which proxy/access logs record unredacted.
            try {
                for (let page = 0; page < MAX_KEY_PAGES && !apiKeyUid; page++) {
                    const res = await nango.get<{ results: { key: string; uid: string }[]; total: number }>({
                        endpoint: '/keys',
                        params: { limit: String(KEYS_PAGE_SIZE), offset: String(page * KEYS_PAGE_SIZE) }
                    });
                    apiKeyUid = res.data.results.find((k) => k.key === apiKey)?.uid;
                    if ((page + 1) * KEYS_PAGE_SIZE >= res.data.total) {
                        break;
                    }
                }
            } catch {
                throw new nango.ActionError({
                    message:
                        'Could not list keys to resolve the API key uid. This requires a key with the keys.get action. Either connect with a key that has keys.get, or pass apiKeyUid explicitly.'
                });
            }
            if (!apiKeyUid) {
                throw new nango.ActionError({
                    message:
                        'The connection API key was not found among the instance keys (the master key cannot sign tenant tokens). Connect with a regular API key, or pass apiKeyUid explicitly.'
                });
            }
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const expiresAt = input.expiresAt ?? nowSeconds + (input.expiresInSeconds ?? DEFAULT_TTL_SECONDS);

        const token = generateTenantToken({
            apiKey,
            apiKeyUid,
            searchRules,
            expiresAt
        });

        return { token, expiresAt };
    }
});

export default action;
