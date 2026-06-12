import crypto from 'node:crypto';

import * as z from 'zod';

import db from '@nangohq/database';
import { pbkdf2, userService } from '@nangohq/shared';
import { report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { deleteUserSessions } from '../../../../clients/auth.client.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { passwordSchema } from '../../account/signup.js';

import type { DBUser, PutUserPassword } from '@nangohq/types';

const validation = z
    .object({
        oldPassword: passwordSchema,
        newPassword: passwordSchema
    })
    .strict();

export const putUserPassword = asyncWrapper<PutUserPassword, never>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
        return;
    }

    const user = res.locals['user'] as DBUser; // type is slightly wrong because we are not in an endpoint with an ?env=
    const body: PutUserPassword['Body'] = val.data;

    const oldHashedPassword = await pbkdf2(body.oldPassword, user.salt, 310000, 32, 'sha256');
    const actualHashedPassword = Buffer.from(user.hashed_password, 'base64');

    if (oldHashedPassword.length !== actualHashedPassword.length || !crypto.timingSafeEqual(actualHashedPassword, oldHashedPassword)) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Incorrect old password.' } });
        return;
    }

    const salt = crypto.randomBytes(16).toString('base64');
    const hashedPassword = (await pbkdf2(body.newPassword, salt, 310000, 32, 'sha256')).toString('base64');

    await db.knex.transaction(async (trx) => {
        await userService.update({ id: user.id, hashed_password: hashedPassword, salt }, trx);
        await deleteUserSessions(user.id, { trx });
    });

    // Re-issue a fresh session so the user who just changed their password stays logged in seamlessly.
    // Best effort basis, if it fails the user can simply re-authenticate with the new password.
    try {
        await new Promise<void>((resolve, reject) =>
            req.session.regenerate((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()))
        );
        await new Promise<void>((resolve, reject) =>
            req.logIn(user as Express.User, (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()))
        );
    } catch (err) {
        report(err);
    }

    res.status(200).send({ success: true });
});
