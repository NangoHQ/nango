import * as z from 'zod';

import { userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { sendVerificationEmail } from '../../../helpers/email.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { ResendVerificationEmailByUuid } from '@nangohq/types';

const validation = z
    .object({
        uuid: z.string().uuid(),
        returnTo: z
            .string()
            .regex(/^\/oauth\/consent\/[A-Za-z0-9_-]+\/review$/)
            .optional()
    })
    .strict();

export const resendVerificationEmailByUuid = asyncWrapper<ResendVerificationEmailByUuid>(async (req, res) => {
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

    const { uuid, returnTo } = val.data;

    const user = await userService.getUserByUuid(uuid);

    if (!user) {
        res.status(404).send({ error: { code: 'user_not_found', message: 'User was not found in our system.' } });
        return;
    }

    if (!user.email_verification_token) {
        res.status(400).send({ error: { code: 'email_already_verified', message: 'Email address was already verified, please login.' } });
        return;
    }

    await sendVerificationEmail(user.email, user.name, user.email_verification_token, returnTo);

    res.status(200).send({ success: true });
});
