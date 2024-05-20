import { z } from 'zod';
import { userService } from '@nangohq/shared';
import type { ResendVerificationEmail } from '@nangohq/types';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { sendVerificationEmail } from '../../../helpers/email.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

const validation = z
    .object({
        uuid: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
    })
    .strict();

export const resendVerificationEmail = asyncWrapper<ResendVerificationEmail>(async (req, res) => {
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

    const { uuid } = val.data;

    const user = await userService.getUserByUuid(uuid);

    if (!user) {
        res.status(404).send({ error: { code: 'user_not_found', message: 'User was found in our system.' } });
        return;
    }

    if (!user.email_verification_token) {
        res.status(400).send({ error: { code: 'email_already_verified', message: 'Email address was already verified, please login.' } });
        return;
    }

    sendVerificationEmail(user.email, user.name, user.email_verification_token);

    res.status(200).send({ success: true });
});
