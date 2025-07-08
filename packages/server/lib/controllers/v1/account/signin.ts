import { z } from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { userToAPI } from '../../../formatters/user.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { getUserFromSession } from '../../../utils/utils.js';

import type { PostSignin } from '@nangohq/types';

const validation = z
    .object({
        email: z.string().email(),
        password: z.string().min(8).max(64)
    })
    .strict();

export const signin = asyncWrapper<PostSignin>(async (req, res) => {
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

    const getUser = await getUserFromSession(req);

    if (getUser.isErr()) {
        res.status(401).send({ error: { code: 'unauthorized', message: getUser.error.message } });
        return;
    }

    const user = getUser.value;

    if (!user.email_verified) {
        // since a session is created to get the user info we need to destroy it
        // since the user is not verified even if they exist and the credentials
        // are correct
        req.session.destroy(() => {
            res.status(400).send({ error: { code: 'email_not_verified' } });
        });
        return;
    }

    res.status(200).send({ user: userToAPI(user) });
});
