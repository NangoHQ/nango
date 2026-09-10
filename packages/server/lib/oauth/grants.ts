import db from '@nangohq/database';
import { oauthTransactionCommitted, revokeOAuthGrantArtifactsInTransaction } from '@nangohq/oauth-server';

import { recordAuditEvent } from '../audit.js';
import { dek } from '../env.js';
import { canRecordAuditTrailForAccount } from '../utils/auditTrail.js';

import type { Knex } from 'knex';

export const PRODUCT_GRANTS = 'oauth_product_grants';
export const GRANT_RESOURCES = 'oauth_product_grant_resources';

export interface ProductGrant {
    id: string;
    provider_grant_hash: Buffer;
    user_id: number;
    account_id: number;
    client_id: string;
    status: 'pending' | 'active' | 'revoked';
    created_at: Date;
    updated_at: Date;
    revoked_at: Date | null;
}

export async function revokeProductBinding(trx: Knex.Transaction, grantIdHash: Buffer): Promise<void> {
    const rows = await trx<ProductGrant>(PRODUCT_GRANTS)
        .where({ provider_grant_hash: grantIdHash })
        .whereNot({ status: 'revoked' })
        .update({ status: 'revoked', revoked_at: new Date(), updated_at: new Date() })
        .returning('*');
    // No event for a rolled-back mutation. No token, client URL or provider grant ID enters the trail.
    void oauthTransactionCommitted(trx)
        .then(async () => {
            for (const row of rows) {
                if (await canRecordAuditTrailForAccount({ id: row.account_id })) {
                    await recordAuditEvent({
                        occurredAt: new Date().toISOString(),
                        accountId: row.account_id,
                        scope: 'account',
                        environment: null,
                        resource: 'oauth_grant',
                        action: 'revoked',
                        outcome: 'success',
                        actor: { type: 'unknown', id: 'oauth_revocation' },
                        context: { interface: 'api' },
                        targets: [{ type: 'oauth_grant', id: row.id }]
                    });
                }
            }
        })
        .catch(() => {
            /* Revocation must not depend on the audit sink. */
        });
}

export async function revokeUserOAuthGrants(userId: number, trx: Knex.Transaction): Promise<void> {
    // Same user row lock as approval: a password change cannot race a new grant into existence.
    await trx('_nango_users').where({ id: userId }).forUpdate().first('id');
    const rows = await trx<ProductGrant>(PRODUCT_GRANTS).where({ user_id: userId }).whereNot({ status: 'revoked' }).select('provider_grant_hash');
    for (const row of rows) {
        await revokeOAuthGrantArtifactsInTransaction({
            trx,
            encryptionKey: dek.get(),
            grantIdHash: row.provider_grant_hash,
            beforeGrantRevoked: revokeProductBinding
        });
    }
}

export async function cleanOAuthConsent(limit: number): Promise<void> {
    const now = new Date();
    await db
        .knex('oauth_consent_decisions')
        .whereIn(
            'interaction_hash',
            db.knex('oauth_consent_decisions').select('interaction_hash').where('expires_at', '<=', now).orderBy('expires_at').limit(limit)
        )
        .delete();
    const stale = await db
        .knex<ProductGrant>(PRODUCT_GRANTS)
        .where({ status: 'pending' })
        .where('created_at', '<', new Date(Date.now() - 10 * 60_000))
        .orderBy('created_at')
        .limit(limit);
    for (const row of stale) {
        await db.knex.transaction(async (trx) => {
            await revokeOAuthGrantArtifactsInTransaction({
                trx,
                encryptionKey: dek.get(),
                grantIdHash: row.provider_grant_hash,
                beforeGrantRevoked: revokeProductBinding
            });
        });
    }
}
