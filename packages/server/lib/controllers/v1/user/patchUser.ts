import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { DBUser, PatchUser } from '@nangohq/types';
import { userService } from '@nangohq/shared';
import { z } from 'zod';
import { userToAPI } from '../../../formatters/user.js';

const validation = z
    .object({
        name: z.string().min(3).max(255)
    })
    .strict();

export const patchUser = asyncWrapper<PatchUser, never>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
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

    const user = res.locals['user'] as DBUser; // type is slightly wrong because we are not in an endpoint with an ?env=
    const body: PatchUser['Body'] = val.data;

    const updated = await userService.update({ id: user.id, ...body });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update user' } });
        return;
    }

    // User is stored in session, so we need to update the DB
    // @ts-expect-error you got to love passport
    req.session.passport.user = updated;
    req.session.save((err) => {
        if (err) {
            res.status(500).send({ error: { code: 'server_error', message: 'failed to update session' } });
            return;
        }

        res.status(200).send({
            data: userToAPI(updated)
        });
    });
});
