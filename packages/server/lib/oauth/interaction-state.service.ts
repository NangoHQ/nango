import { createHash, randomBytes } from 'node:crypto';

import db from '@nangohq/database';

import type { DBTeam, DBUser } from '@nangohq/types';

const OAUTH_LOGIN_HANDOFFS_TABLE = 'oauth_login_handoffs';
const OAUTH_CONSENT_INTERACTIONS_TABLE = 'oauth_consent_interactions';
const HANDOFF_TTL_MS = 45_000;

interface HandoffRow {
    id: string;
    interaction_uid_hash: Buffer;
    issuer: string;
    return_destination: string;
    user_id: number | null;
    account_id: number | null;
    expires_at: Date;
    issued_at: Date | null;
    consumed_at: Date | null;
}

interface ConsentRow {
    csrf_token_hash: Buffer;
    user_id: number;
    account_id: number;
    status: 'pending' | 'processing' | 'approved' | 'denied';
    expires_at: Date;
}

export type HandoffFailure = 'invalid' | 'expired' | 'replayed' | 'user_suspended' | 'account_unavailable';

export async function createLoginHandoff({
    uid,
    issuer,
    returnDestination,
    interactionExpiresAt
}: {
    uid: string;
    issuer: string;
    returnDestination: string;
    interactionExpiresAt: Date;
}): Promise<string> {
    validateReturnDestination(returnDestination, issuer, uid);
    const state = randomToken();
    const expiresAt = new Date(Math.min(interactionExpiresAt.getTime(), Date.now() + HANDOFF_TTL_MS));
    await db.knex(OAUTH_LOGIN_HANDOFFS_TABLE).insert({
        state_hash: hash(state),
        interaction_uid_hash: hash(uid),
        issuer,
        return_destination: returnDestination,
        expires_at: expiresAt,
        created_at: new Date()
    });
    return state;
}

export async function issueLoginHandoff({
    state,
    userId,
    accountId,
    issuer
}: {
    state: string;
    userId: number;
    accountId: number;
    issuer: string;
}): Promise<{ consumeUrl: string; code: string } | { error: HandoffFailure }> {
    return await db.knex.transaction(async (trx) => {
        const row = await trx(OAUTH_LOGIN_HANDOFFS_TABLE)
            .where({ state_hash: hash(state) })
            .forUpdate()
            .first<HandoffRow>();
        const now = new Date();
        if (!row || row.issuer !== issuer) return { error: 'invalid' };
        if (row.expires_at <= now) return { error: 'expired' };
        if (row.issued_at || row.consumed_at) return { error: 'replayed' };
        if (!isSafeReturnDestination(row.return_destination, issuer)) return { error: 'invalid' };

        const user = await trx<DBUser>('_nango_users').where({ id: userId, account_id: accountId, suspended: false }).first('id');
        if (!user) return { error: 'user_suspended' };
        const account = await trx<DBTeam>('_nango_accounts').where({ id: accountId }).first('id');
        if (!account) return { error: 'account_unavailable' };

        const code = randomToken();
        await trx(OAUTH_LOGIN_HANDOFFS_TABLE)
            .where({ id: row.id })
            .update({
                code_hash: hash(code),
                user_id: userId,
                account_id: accountId,
                issued_at: now
            });
        return { consumeUrl: row.return_destination, code };
    });
}

export async function consumeLoginHandoff({
    code,
    uid,
    issuer,
    returnDestination
}: {
    code: string;
    uid: string;
    issuer: string;
    returnDestination: string;
}): Promise<{ userId: number; accountId: number } | { error: HandoffFailure }> {
    return await db.knex.transaction(async (trx) => {
        const row = await trx(OAUTH_LOGIN_HANDOFFS_TABLE)
            .where({ code_hash: hash(code) })
            .forUpdate()
            .first<HandoffRow>();
        const now = new Date();
        if (!row || row.issuer !== issuer || row.return_destination !== returnDestination || !row.interaction_uid_hash.equals(hash(uid))) {
            return { error: 'invalid' };
        }
        if (row.expires_at <= now) return { error: 'expired' };
        if (row.consumed_at) return { error: 'replayed' };
        if (!row.issued_at || !row.user_id || !row.account_id) return { error: 'invalid' };
        validateReturnDestination(row.return_destination, issuer, uid);

        const user = await trx<DBUser>('_nango_users').where({ id: row.user_id, account_id: row.account_id, suspended: false }).first('id', 'account_id');
        if (!user) return { error: 'user_suspended' };
        const account = await trx<DBTeam>('_nango_accounts').where({ id: row.account_id }).first('id');
        if (!account) return { error: 'account_unavailable' };

        const consumed = await trx(OAUTH_LOGIN_HANDOFFS_TABLE).where({ id: row.id, consumed_at: null }).update({ consumed_at: now });
        if (consumed !== 1) return { error: 'replayed' };
        return { userId: row.user_id, accountId: row.account_id };
    });
}

export async function establishConsentInteraction({
    uid,
    userId,
    accountId,
    expiresAt
}: {
    uid: string;
    userId: number;
    accountId: number;
    expiresAt: Date;
}): Promise<string | null> {
    const csrfToken = randomToken();
    const now = new Date();
    return await db.knex.transaction(async (trx) => {
        const interactionUidHash = hash(uid);
        const existing = await trx(OAUTH_CONSENT_INTERACTIONS_TABLE).where({ interaction_uid_hash: interactionUidHash }).forUpdate().first<ConsentRow>();
        if (existing && (existing.user_id !== userId || existing.account_id !== accountId || existing.status !== 'pending' || existing.expires_at <= now)) {
            return null;
        }

        await trx(OAUTH_CONSENT_INTERACTIONS_TABLE)
            .insert({
                interaction_uid_hash: interactionUidHash,
                csrf_token_hash: hash(csrfToken),
                user_id: userId,
                account_id: accountId,
                status: 'pending',
                expires_at: expiresAt,
                created_at: now,
                updated_at: now
            })
            .onConflict('interaction_uid_hash')
            .merge({ csrf_token_hash: hash(csrfToken), updated_at: now });
        return csrfToken;
    });
}

export async function claimConsentDecision({
    uid,
    csrfToken,
    userId,
    accountId
}: {
    uid: string;
    csrfToken: string;
    userId: number;
    accountId: number;
}): Promise<'claimed' | 'invalid_csrf' | 'expired' | 'completed'> {
    return await db.knex.transaction(async (trx) => {
        const row = await trx(OAUTH_CONSENT_INTERACTIONS_TABLE)
            .where({ interaction_uid_hash: hash(uid) })
            .forUpdate()
            .first<ConsentRow>();
        if (!row || row.user_id !== userId || row.account_id !== accountId || !row.csrf_token_hash.equals(hash(csrfToken))) return 'invalid_csrf';
        if (row.expires_at <= new Date()) return 'expired';
        if (row.status !== 'pending') return 'completed';

        await trx(OAUTH_CONSENT_INTERACTIONS_TABLE)
            .where({ interaction_uid_hash: hash(uid), status: 'pending' })
            .update({ status: 'processing', updated_at: new Date() });
        return 'claimed';
    });
}

export async function completeConsentDecision(uid: string, decision: 'approved' | 'denied'): Promise<void> {
    const completed = await db
        .knex(OAUTH_CONSENT_INTERACTIONS_TABLE)
        .where({ interaction_uid_hash: hash(uid), status: 'processing' })
        .update({ status: decision, completed_at: new Date(), updated_at: new Date() });
    if (completed !== 1) throw new Error('OAuth consent decision state could not be completed');
}

export async function releaseConsentDecision(uid: string): Promise<void> {
    await db
        .knex(OAUTH_CONSENT_INTERACTIONS_TABLE)
        .where({ interaction_uid_hash: hash(uid), status: 'processing' })
        .update({ status: 'pending', updated_at: new Date() });
}

export async function deleteExpiredOAuthInteractionState(limit: number): Promise<number> {
    const now = new Date();
    const [handoffs, interactions] = await Promise.all([
        db
            .knex(OAUTH_LOGIN_HANDOFFS_TABLE)
            .whereIn('id', db.knex(OAUTH_LOGIN_HANDOFFS_TABLE).select('id').where('expires_at', '<=', now).orderBy('expires_at').limit(limit))
            .delete(),
        db
            .knex(OAUTH_CONSENT_INTERACTIONS_TABLE)
            .whereIn(
                'interaction_uid_hash',
                db.knex(OAUTH_CONSENT_INTERACTIONS_TABLE).select('interaction_uid_hash').where('expires_at', '<=', now).orderBy('expires_at').limit(limit)
            )
            .delete()
    ]);
    return handoffs + interactions;
}

function randomToken(): string {
    return randomBytes(32).toString('base64url');
}

function hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}

function validateReturnDestination(destination: string, issuer: string, uid: string): void {
    const expected = new URL(`/oauth/consent/${encodeURIComponent(uid)}/handoff`, issuer).href;
    if (destination !== expected) throw new Error('Unsafe OAuth login handoff return destination');
}

function isSafeReturnDestination(destination: string, issuer: string): boolean {
    try {
        const url = new URL(destination);
        return url.origin === issuer && /^\/oauth\/consent\/[^/]+\/handoff$/.test(url.pathname) && !url.search && !url.hash;
    } catch {
        return false;
    }
}
