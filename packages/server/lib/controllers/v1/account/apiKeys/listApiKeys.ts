import db from '@nangohq/database';
import { customerKeyService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { AccountApiKeyScope, ListAccountApiKeys } from '@nangohq/types';

export const listAccountApiKeys = asyncWrapper<ListAccountApiKeys>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const result = await customerKeyService.getAccountApiKeys(db.knex, res.locals.account.id);
    if (result.isErr()) {
        report(result.error);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to retrieve account API keys' } });
        return;
    }

    res.status(200).send({
        data: result.value.map((key) => ({
            id: key.id,
            uuid: key.uuid,
            display_name: key.display_name,
            scopes: (key.scopes ?? []) as AccountApiKeyScope[],
            secret: key.secret,
            last_used_at: key.last_used_at ? key.last_used_at.toISOString() : null,
            created_at: key.created_at.toISOString()
        }))
    });
});
