import * as z from 'zod';

import { userService } from '@nangohq/shared';
import { getLogger, zodErrorToHTTP } from '@nangohq/utils';

import { sendVerificationEmail } from '../../../helpers/email.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetEmailByExpiredToken } from '@nangohq/types';

const logger = getLogger('Server.GetEmailByExpiredToken');

const validation = z
    .object({
        token: z.string().uuid()
    })
    .strict();

const queryValidation = z
    .object({
        returnTo: z
            .string()
            .regex(/^\/oauth\/consent\/[A-Za-z0-9_-]+\/review$/)
            .optional()
    })
    .strict();

export const getEmailByExpiredToken = asyncWrapper<GetEmailByExpiredToken>(async (req, res) => {
    const query = queryValidation.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const val = validation.safeParse(req.params);

    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { token } = val.data;

    const user = await userService.refreshEmailVerificationToken(token);

    if (!user || !user.email_verification_token) {
        logger.error('Error refreshing email verification token');
        res.status(500).send({
            error: { code: 'error_refreshing_token', message: 'There was a problem refreshing the token. Please reach out to support.' }
        });
        return;
    }

    await sendVerificationEmail(user.email, user.name, user.email_verification_token, query.data.returnTo);

    if (!user) {
        res.status(404).send({ error: { code: 'user_not_found' } });
        return;
    }

    res.status(200).send({ email: user.email, verified: user.email_verified, uuid: user.uuid });
});
