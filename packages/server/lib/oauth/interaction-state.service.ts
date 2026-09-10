import { createHash, randomBytes } from 'node:crypto';

import db from '@nangohq/database';

const OAUTH_CONSENT_INTERACTIONS_TABLE = 'oauth_consent_interactions';

interface ConsentRow {
    csrf_token_hash: Buffer;
    user_id: number;
    account_id: number;
    status: 'pending' | 'processing' | 'approved' | 'denied';
    expires_at: Date;
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
    return await db
        .knex(OAUTH_CONSENT_INTERACTIONS_TABLE)
        .whereIn(
            'interaction_uid_hash',
            db.knex(OAUTH_CONSENT_INTERACTIONS_TABLE).select('interaction_uid_hash').where('expires_at', '<=', now).orderBy('expires_at').limit(limit)
        )
        .delete();
}

function randomToken(): string {
    return randomBytes(32).toString('base64url');
}

function hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
}
