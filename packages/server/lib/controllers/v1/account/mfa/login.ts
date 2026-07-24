import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { accountService, mfaService, userService } from '@nangohq/shared';

import type { DBUser, PostMFALoginVerification } from '@nangohq/types';
import type { Request } from 'express';

const MFA_LOGIN_TTL_MS = 10 * 60 * 1000;
// Reserved TLD (RFC 2606) used only to resolve relative paths; a returnTo that escapes this origin is rejected.
const RETURN_TO_BASE_ORIGIN = 'https://internal.invalid';

type PendingMFALoginResult = { user: DBUser; returnTo: string } | { error: 'expired' | 'invalid' };

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

export async function verifyPendingMfaLogin(req: Request, credential: PostMFALoginVerification['Body']): Promise<PendingMFALoginResult> {
    const pending = req.session.pendingMfaLogin;
    if (!pending || Date.now() - pending.createdAt > MFA_LOGIN_TTL_MS) {
        delete req.session.pendingMfaLogin;
        await saveSession(req);
        return { error: 'expired' };
    }

    const user = await loadEligibleUser(pending.userId);
    if (!user) {
        return { error: 'invalid' };
    }
    const verified = (
        credential.type === 'recoveryCode'
            ? await mfaService.consumeRecoveryCode(user.id, credential.recoveryCode)
            : await mfaService.verifyTotp(user.id, credential.code)
    ).unwrap();
    if (!verified) {
        return { error: 'invalid' };
    }

    // Account state can change while the user completes the MFA challenge.
    const currentUser = await loadEligibleUser(pending.userId);
    if (!currentUser) {
        return { error: 'invalid' };
    }

    const returnTo = pending.returnTo;
    delete req.session.pendingMfaLogin;
    await loginUser(req, currentUser);
    await saveSession(req);
    return { user: currentUser, returnTo };
}

async function loadEligibleUser(userId: number): Promise<DBUser | null> {
    const user = await userService.getUserById(userId, true);
    if (!user || user.suspended || !(await isMFAEnabled(user))) {
        return null;
    }
    return user;
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
    try {
        const url = new URL(returnTo, RETURN_TO_BASE_ORIGIN);
        if (url.origin === RETURN_TO_BASE_ORIGIN) {
            return url.pathname + url.search + url.hash;
        }
    } catch {
        // Malformed value; fall through to the safe default.
    }
    return '/';
}
