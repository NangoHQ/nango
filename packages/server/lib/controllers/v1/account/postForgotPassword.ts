import jwt from 'jsonwebtoken';
import * as z from 'zod';

import { userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { sendResetPasswordEmail } from '../../../helpers/email.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { resetPasswordSecret } from '../../../utils/utils.js';

import type { PostForgotPassword } from '@nangohq/types';

const validation = z.object({ email: z.string().email() }).strict();

export const postForgotPassword = asyncWrapper<PostForgotPassword>(async (req, res) => {
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

    const { email } = val.data;

    const user = await userService.getUserByEmail(email);
    if (!user) {
        res.status(400).send({
            error: { code: 'user_not_found' }
        });
        return;
    }

    const resetToken = jwt.sign({ user: email }, resetPasswordSecret(), { expiresIn: '10m' });

    user.reset_password_token = resetToken;
    await userService.editUserPassword(user);

    await sendResetPasswordEmail({ user, token: resetToken });

    res.status(200).json({
        success: true
    });
});
