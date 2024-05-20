import { z } from 'zod';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { getUserFromSession } from '../../../utils/utils.js';
import { sendVerificationEmail } from '../../../helpers/email.js';
import type { WebUser, Signin } from '@nangohq/types';

const validation = z
    .object({
        email: z.string().email(),
        password: z.string().min(8)
    })
    .strict();

export const signin = asyncWrapper<Signin>(async (req, res) => {
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
        sendVerificationEmail(user.email, user.name, user.email_verification_token as string);
        res.status(400).send({ error: { code: 'email_not_verified' } });
        return;
    }

    const webUser: WebUser = {
        id: user.id,
        accountId: user.account_id,
        email: user.email,
        name: user.name
    };
    res.status(200).send({ user: webUser });
});
