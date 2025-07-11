import { z } from 'zod';

import { logContextGetter } from '@nangohq/logs';
import { accountService, userService } from '@nangohq/shared';
import { flags, report, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { LogContext } from '@nangohq/logs';
import type { PostImpersonate } from '@nangohq/types';

const schemaBody = z
    .object({
        accountUUID: z.string().uuid(),
        loginReason: z.string().min(1).max(1024)
    })
    .strict();

const IMPERSONATE_SESSION_EXPIRATION_MS = 600 * 1000;

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
    const { account, environment, user: adminUser } = res.locals;

    if (account.uuid !== envs.NANGO_ADMIN_UUID) {
        res.status(401).send({ error: { code: 'forbidden', message: 'You are not authorized to impersonate an account' } });
        return;
    }

    const result = await accountService.getAccountAndEnvironmentIdByUUID(body.accountUUID, environment.name);
    if (!result) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Account not found' } });
        return;
    }

    const user = await userService.getAnUserByAccountId(result.accountId);
    if (!user) {
        res.status(400).send({ error: { code: 'invalid_body', message: 'Cannot switch to account with no users' } });
        return;
    }

    let logCtx: LogContext | undefined;
    try {
        logCtx = await logContextGetter.create(
            { operation: { type: 'admin', action: 'impersonation' } },
            {
                account,
                environment,
                meta: { loginReason: body.loginReason, admin: adminUser.email, impersonating: user.id }
            }
        );
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
