import jwt from 'jsonwebtoken';
import * as z from 'zod';

import db from '@nangohq/database';
import { pbkdf2, userService } from '@nangohq/shared';
import { PBKDF2_ITERATIONS, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { deleteUserSessions } from '../../../clients/auth.client.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { resetPasswordSecret } from '../../../utils/utils.js';
import { isStepUpRefused, isStepUpRequired, mfaCredentialSchema, verifyStepUpMfa } from './mfa/stepUp.js';
import { passwordSchema } from './signup.js';

import type { PutResetPassword } from '@nangohq/types';

const validation = z
    .object({
        token: z.string(),
        password: passwordSchema,
        mfa: mfaCredentialSchema.optional()
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

    const { password, token, mfa } = val.data;

    const user = await userService.getUserByResetPasswordToken(token);
    if (!user) {
        res.status(400).send({
            error: { code: 'user_not_found' }
        });
        return;
    }

    try {
        jwt.verify(token, resetPasswordSecret());
    } catch {
        res.status(400).send({
            error: { code: 'invalid_token' }
        });
        return;
    }

    if (!mfa && (await isStepUpRequired(user))) {
        res.status(400).send({ error: { code: 'mfa_code_required' } });
        return;
    }

    const hashedPassword = (await pbkdf2(password, user.salt, PBKDF2_ITERATIONS, 32, 'sha256')).toString('base64');

    const outcome = await db.knex.transaction(async (trx) => {
        const stepUp = await verifyStepUpMfa(user, mfa, trx);
        if (isStepUpRefused(stepUp)) {
            return stepUp;
        }

        user.hashed_password = hashedPassword;
        user.reset_password_token = null;
        await userService.editUserPassword(user, trx);
        await deleteUserSessions(user.id, { trx });
        return 'reset' as const;
    });

    if (outcome === 'required') {
        res.status(400).send({ error: { code: 'mfa_code_required' } });
        return;
    }
    if (outcome === 'invalid') {
        res.status(400).send({ error: { code: 'invalid_mfa_code' } });
        return;
    }

    res.status(200).json({
        success: true
    });
});
