import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { GetEmailByUuid } from '@nangohq/types';

const validation = z
    .object({
        uuid: z.string().uuid()
    })
    .strict();

export const getEmailByUuid = asyncWrapper<GetEmailByUuid>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.params);

    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { uuid } = val.data;

    const user = await userService.getUserByUuid(uuid);

    if (!user) {
        res.status(404).send({ error: { code: 'user_not_found' } });
        return;
    }

    res.status(200).send({ email: user.email, verified: user.email_verified });
});
