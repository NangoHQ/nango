import * as z from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { accountService, mfaService, userService } from '@nangohq/shared';
import { flags, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { hasRecentMfa, markMfaVerified } from '../../account/mfa/elevation.js';

import type { RequestLocals } from '../../../../utils/express.js';
import type { LogContext } from '@nangohq/logs';
import type { DBUser, PostImpersonate } from '@nangohq/types';
import type { Request, Response } from 'express';

const schemaBody = z
    .object({
        accountUUID: z.string().uuid(),
        loginReason: z.string().min(1).max(1024),
        code: z
            .string()
            .regex(/^\d{6}$/)
            .optional()
    })
    .strict();

const IMPERSONATE_SESSION_EXPIRATION_MS = 600 * 1000;
const RECENT_MFA_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Verifies the admin's own factor, not the target user's. This is a step-up check on an already
 * authenticated session, so it verifies inline instead of parking a pending login the way
 * `loginOrStartPendingMfa` does for sign-in.
 *
 * A factor presented in the last RECENT_MFA_MAX_AGE_MS on this session counts, which is what makes
 * signing in and impersonating straight away work without a second code.
 *
 * Deliberately not gated on the per-account MFA feature flag: the admin account may not carry it,
 * and that would silently turn the whole challenge into a no-op.
 */
async function challengeAdmin({
    req,
    res,
    logCtx,
    adminUser,
    code
}: {
    req: Request;
    res: Response<PostImpersonate['Reply'], RequestLocals>;
    logCtx: LogContext;
    adminUser: DBUser;
    code: string | undefined;
}): Promise<boolean> {
    if (!(await mfaService.hasActiveFactor(adminUser.id))) {
        void logCtx.error('Impersonation refused, admin has no MFA factor enrolled');
        res.status(400).send({ error: { code: 'mfa_not_enabled' } });
        return false;
    }

    if (hasRecentMfa(req, RECENT_MFA_MAX_AGE_MS)) {
        void logCtx.info('Impersonation accepted on an MFA verification from earlier in this session');
        return true;
    }

    if (!code) {
        void logCtx.error('Impersonation refused, no MFA code provided');
        res.status(400).send({ error: { code: 'mfa_code_required' } });
        return false;
    }

    const verified = await mfaService.verifyTotp(adminUser.id, code);
    if (verified.isErr()) {
        throw verified.error;
    }
    if (!verified.value) {
        void logCtx.error('Impersonation refused, invalid MFA code');
        res.status(400).send({ error: { code: 'invalid_mfa_code' } });
        return false;
    }

    // Dropped by the session regeneration in req.login on the happy path, which is what keeps
    // elevation out of the impersonated session. It survives on the paths that reject the target
    // below, so a mistyped account UUID does not cost another code.
    markMfaVerified(req);
    return true;
}

export const postImpersonate = asyncWrapper<PostImpersonate>(async (req, res) => {
    if (!flags.hasAdminCapabilities) {
        res.status(400).send({ error: { code: 'feature_disabled', message: 'Admin capabilities are not enabled' } });
        return;
    }

    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = schemaBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body: PostImpersonate['Body'] = valBody.data;
    const { account, environment, user: adminUser, authType } = res.locals;

    if (account.uuid !== envs.NANGO_ADMIN_UUID) {
        res.status(401).send({ error: { code: 'forbidden', message: 'You are not authorized to impersonate an account' } });
        return;
    }

    // Every impersonation attempt is recorded, including the ones that are refused below.
    const meta: Record<string, unknown> = {
        loginReason: body.loginReason,
        admin: adminUser?.email,
        authType,
        targetAccountUUID: body.accountUUID,
        mfa: envs.NANGO_IMPERSONATION_MFA_REQUIRED ? 'required' : 'skipped_breakglass'
    };

    let logCtx: LogContext | undefined;
    try {
        logCtx = await logContextGetter.create({ operation: { type: 'admin', action: 'impersonation' } }, { account, environment, meta });

        if (!adminUser) {
            void logCtx.error('Impersonation refused, a secret key has no session to challenge');
            res.status(401).send({ error: { code: 'forbidden', message: 'Impersonation requires a dashboard session' } });
            await logCtx.failed();
            return;
        }

        if (envs.NANGO_IMPERSONATION_MFA_REQUIRED) {
            if (!(await challengeAdmin({ req, res, logCtx, adminUser, code: body.code }))) {
                await logCtx.failed();
                return;
            }
        } else {
            void logCtx.warn('Impersonation MFA challenge skipped, NANGO_IMPERSONATION_MFA_REQUIRED is off');
        }

        const accountTarget = await accountService.getAccountByUUID(body.accountUUID);
        if (!accountTarget) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'Account not found' } });
            await logCtx.failed();
            return;
        }

        const user = await userService.getAnUserByAccountId(accountTarget.id);
        if (!user) {
            res.status(400).send({ error: { code: 'invalid_body', message: 'Cannot switch to account with no users' } });
            await logCtx.failed();
            return;
        }

        await logCtx.enrichOperation({ meta: { ...meta, impersonating: user.id } });
        void logCtx.info('A Nango admin logged into another account');

        req.login(user, (err) => {
            if (err) {
                res.status(500).send({ error: { code: 'server_error', message: 'Failed to login as user' } });
                void logCtx!.failed();
                return;
            }

            // Modify default session to expires sooner than regular session
            req.session.cookie.expires = new Date(Date.now() + IMPERSONATE_SESSION_EXPIRATION_MS);
            req.session.debugMode = true;

            req.session.save((err) => {
                if (err) {
                    res.status(500).send({ error: { code: 'server_error', message: 'Failed to modify session' } });
                    void logCtx!.failed();
                    return;
                }

                void logCtx!.success();
                res.status(200).send({ success: true });
            });
        });
    } catch (err) {
        report(err);
        if (logCtx) {
            void logCtx.error('uncaught error', { error: err });
            await logCtx.failed();
        }
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to impersonate user' } });
    }
});
