import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { accountService, mfaService, recordMFALoginRefused, recordMFAVerifyFailure, userService } from '@nangohq/shared';

import { safeReturnTo } from '../returnTo.js';
import { markMfaVerified } from './elevation.js';

import type { DBUser, PostMFALoginVerification } from '@nangohq/types';
import type { Request } from 'express';
import type { Knex } from 'knex';

const MFA_LOGIN_TTL_MS = 10 * 60 * 1000;

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
    const method = credential.type === 'recoveryCode' ? 'recovery_code' : 'totp';
    const pending = req.session.pendingMfaLogin;
    if (!pending || Date.now() - pending.createdAt > MFA_LOGIN_TTL_MS) {
        delete req.session.pendingMfaLogin;
        await saveSession(req);
        recordMFAVerifyFailure({ context: 'login', method, reason: 'challenge_expired' });
        return { error: 'expired' };
    }

    const user = await loadEligibleUser(pending.userId);
    if (!user) {
        recordMFAVerifyFailure({ context: 'login', method, reason: 'user_not_eligible' });
        return { error: 'invalid' };
    }
    const verified = (
        credential.type === 'recoveryCode'
            ? await mfaService.consumeRecoveryCode(user.id, credential.recoveryCode, { context: 'login' })
            : await mfaService.verifyTotp(user.id, credential.code, { context: 'login' })
    ).unwrap();
    if (!verified) {
        return { error: 'invalid' };
    }

    // Account state can change while the user completes the MFA challenge.
    const currentUser = await loadEligibleUser(pending.userId);
    if (!currentUser) {
        recordMFALoginRefused({ method, reason: 'user_not_eligible' });
        return { error: 'invalid' };
    }

    const returnTo = pending.returnTo;
    delete req.session.pendingMfaLogin;
    await loginUser(req, currentUser);
    markMfaVerified(req);
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

export async function isMFAEnabled(user: DBUser, trx: Knex = db.knex): Promise<boolean> {
    const account = await accountService.getAccountById(trx, user.account_id);
    return Boolean(account && (await getFlags().isMFAEnabled(account.uuid)));
}

async function loginUser(req: Request, user: DBUser): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        req.login(user, (err) => {
            if (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
                return;
            }
            req.audit = { ...req.audit, authSucceeded: true };
            resolve();
        });
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
