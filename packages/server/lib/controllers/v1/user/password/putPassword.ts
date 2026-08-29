import crypto from 'node:crypto';

import * as z from 'zod';

import db from '@nangohq/database';
import { pbkdf2, userService } from '@nangohq/shared';
import { PBKDF2_ITERATIONS, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { deleteUserSessions } from '../../../../clients/auth.client.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { hasRecentMfa } from '../../account/mfa/elevation.js';
import { isStepUpRefused, isStepUpRequired, mfaCredentialSchema, verifyStepUpMfa } from '../../account/mfa/stepUp.js';
import { passwordSchema } from '../../account/signup.js';

import type { DBUser, PutUserPassword } from '@nangohq/types';

/** One TOTP step: any shorter and the only code the user has is the one just spent at login. */
const PASSWORD_MFA_MAX_AGE_MS = 30 * 1000;

const validation = z
    .object({
        oldPassword: z.string().min(1).max(64),
        newPassword: passwordSchema,
        mfa: mfaCredentialSchema.optional()
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

    const oldHashedPassword = await pbkdf2(body.oldPassword, user.salt, PBKDF2_ITERATIONS, 32, 'sha256');
    const actualHashedPassword = Buffer.from(user.hashed_password, 'base64');

    if (oldHashedPassword.length !== actualHashedPassword.length || !crypto.timingSafeEqual(actualHashedPassword, oldHashedPassword)) {
        res.status(400).send({ error: { code: 'incorrect_password' } });
        return;
    }

    const recentlyVerified = hasRecentMfa(req, PASSWORD_MFA_MAX_AGE_MS);
    if (!body.mfa && !recentlyVerified && (await isStepUpRequired(user))) {
        res.status(400).send({ error: { code: 'mfa_code_required' } });
        return;
    }

    const salt = crypto.randomBytes(16).toString('base64');
    const hashedPassword = (await pbkdf2(body.newPassword, salt, PBKDF2_ITERATIONS, 32, 'sha256')).toString('base64');

    const outcome = await db.knex.transaction(async (trx) => {
        const stepUp = await verifyStepUpMfa(user, body.mfa, trx, { recentlyVerified });
        if (isStepUpRefused(stepUp)) {
            return stepUp;
        }

        await userService.update({ id: user.id, hashed_password: hashedPassword, salt }, trx);
        await deleteUserSessions(user.id, { trx });
        return 'changed' as const;
    });

    if (outcome === 'required') {
        res.status(400).send({ error: { code: 'mfa_code_required' } });
        return;
    }
    if (outcome === 'invalid') {
        res.status(400).send({ error: { code: 'invalid_mfa_code' } });
        return;
    }

    // Re-issue a fresh session so the user who just changed their password stays logged in seamlessly.
    // req.logIn regenerates the session id internally (passport's fixation guard), rotating the current
    // session. Best effort: if it fails the user can simply re-authenticate with the new password.
    try {
        await new Promise<void>((resolve, reject) =>
            req.logIn(user as Express.User, (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()))
        );
    } catch (err) {
        report(err);
    }

    res.status(200).send({ success: true });
});
