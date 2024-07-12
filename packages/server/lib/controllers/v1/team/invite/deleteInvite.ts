import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { DeleteInvite } from '@nangohq/types';
import { expirePreviousInvitations } from '@nangohq/shared';
import { z } from 'zod';
import db from '@nangohq/database';

const validation = z
    .object({
        email: z.string().min(3).max(255).email()
    })
    .strict();

export const deleteInvite = asyncWrapper<DeleteInvite>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { account } = res.locals;
    const body: DeleteInvite['Body'] = val.data;

    await expirePreviousInvitations({ email: body.email, accountId: account.id, trx: db.knex });

    res.status(200).send({
        data: { success: true }
    });
});
