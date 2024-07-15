import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PutTeam } from '@nangohq/types';
import { accountService } from '@nangohq/shared';
import { z } from 'zod';

const validation = z
    .object({
        name: z.string().min(3).max(255)
    })
    .strict();

export const putTeam = asyncWrapper<PutTeam>(async (req, res) => {
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
    const body: PutTeam['Body'] = val.data;

    await accountService.editAccount({ id: account.id, ...body });

    res.status(200).send({
        data: {
            ...account,
            ...body
        }
    });
});
