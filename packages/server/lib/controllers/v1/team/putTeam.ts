import { z } from 'zod';

import { accountService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { teamToApi } from '../../../formatters/team.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PutTeam } from '@nangohq/types';

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
        data: teamToApi({
            ...account,
            ...body
        })
    });
});
