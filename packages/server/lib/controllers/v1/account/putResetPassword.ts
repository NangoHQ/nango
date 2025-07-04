import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { pbkdf2, userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { passwordSchema } from './signup.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { resetPasswordSecret } from '../../../utils/utils.js';

import type { PutResetPassword } from '@nangohq/types';

const validation = z
    .object({
        token: z.string(),
        password: passwordSchema
    })
    .strict();

export const putResetPassword = asyncWrapper<PutResetPassword>(async (req, res) => {
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

    const { password, token } = req.body;

    const user = await userService.getUserByResetPasswordToken(token);
    if (!user) {
        res.status(400).send({
            error: { code: 'user_not_found' }
        });
        return;
    }

    try {
        jwt.verify(token, resetPasswordSecret());

        const hashedPassword = (await pbkdf2(password, user.salt, 310000, 32, 'sha256')).toString('base64');

        user.hashed_password = hashedPassword;
        user.reset_password_token = null;
        await userService.editUserPassword(user);

        res.status(200).json({
            success: true
        });
    } catch {
        res.status(400).send({
            error: { code: 'invalid_token' }
        });
        return;
    }
});
