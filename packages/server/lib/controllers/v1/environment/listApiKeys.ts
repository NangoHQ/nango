import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { canReadProdSecret } from '../../../authz/resolve.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { ApiKeyScope, ListApiKeys } from '@nangohq/types';

export const listApiKeys = asyncWrapper<ListApiKeys>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { environment } = res.locals;

    const canReadSecret = await canReadProdSecret(res.locals, environment);

    const keysResult = await customerKeyService.getApiKeysByEnv(db.knex, environment.id);
    if (keysResult.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve API keys' } });
        return;
    }

    const data = keysResult.value.map((key) => {
        const secret = canReadSecret ? key.secret : `****${key.secret.slice(-4)}`;
        return {
            id: key.id,
            display_name: key.display_name,
            scopes: (key.scopes ?? []) as ApiKeyScope[],
            secret,
            last_used_at: key.last_used_at ? key.last_used_at.toISOString() : null,
            created_at: key.created_at.toISOString(),
            updated_at: key.updated_at.toISOString()
        };
    });

    res.status(200).send({ data });
});
