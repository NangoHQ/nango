import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { accountService, mfaService, userService } from '@nangohq/shared';

import type { DBUser } from '@nangohq/types';
import type { Request } from 'express';

const MFA_LOGIN_TTL_MS = 10 * 60 * 1000;

export async function loginOrStartPendingMfa(req: Request, user: DBUser, returnTo: string): Promise<boolean> {
    if (!(await isMFAEnabled(user)) || !(await mfaService.hasActiveFactor(user.id))) {
        await loginUser(req, user);
        return false;
    }

    await regenerateSession(req);
    req.session.pendingMfaLogin = { userId: user.id, returnTo: safeReturnTo(returnTo), createdAt: Date.now() };
    await saveSession(req);
    return true;
}

export async function verifyPendingMfaLogin(req: Request, code: string, recoveryCode?: string): Promise<{ user: DBUser; returnTo: string } | null> {
    const pending = req.session.pendingMfaLogin;
    if (!pending || Date.now() - pending.createdAt > MFA_LOGIN_TTL_MS) {
        delete req.session.pendingMfaLogin;
        await saveSession(req);
        return null;
    }

    const user = await userService.getUserById(pending.userId, true);
    if (!user || !(await isMFAEnabled(user))) {
        return null;
    }
    const verified = recoveryCode ? await mfaService.consumeRecoveryCode(user.id, recoveryCode) : await mfaService.verifyTotp(user.id, code);
    if (!verified) {
        return null;
    }

    const returnTo = pending.returnTo;
    await loginUser(req, user);
    req.session.mfaVerifiedAt = Date.now();
    await saveSession(req);
    return { user, returnTo };
}

async function isMFAEnabled(user: DBUser): Promise<boolean> {
    const account = await accountService.getAccountById(db.knex, user.account_id);
    return Boolean(account && (await getFlags().isMFAEnabled(account.uuid)));
}

async function loginUser(req: Request, user: DBUser): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        req.login(user, (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
    });
}

async function regenerateSession(req: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
    });
}

async function saveSession(req: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
    });
}

function safeReturnTo(returnTo: string): string {
    return returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
}
