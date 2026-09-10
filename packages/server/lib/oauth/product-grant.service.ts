import db from '@nangohq/database';
import { hashOAuthIdentifier, OAUTH_GRANT_TTL_SECONDS, revokeOAuthGrantByHash } from '@nangohq/oauth-server';

import type { Knex } from 'knex';

export const OAUTH_PRODUCT_GRANTS_TABLE = 'oauth_product_grants';
export const OAUTH_PRODUCT_GRANT_RESOURCES_TABLE = 'oauth_product_grant_resources';

export interface ProductGrantResource {
    resource: string;
    scopes: string[];
}

export interface RevokedProductGrant {
    id: string;
    accountId: number;
    userId: number;
    userEmail: string;
    resources: ProductGrantResource[];
}

export interface RevokedUserProductGrant {
    id: string;
    accountId: number;
    userId: number;
    providerGrantIdHash: Buffer;
    resources: ProductGrantResource[];
}

interface ProductGrantRow {
    id: string;
    provider_grant_id_hash: Buffer;
    client_id_hash: Buffer;
    user_id: number;
    account_id: number;
    status: 'pending' | 'active' | 'revoked';
}

export async function createPendingProductGrant({
    grantId,
    clientId,
    encryptionKey,
    userId,
    accountId,
    resources
}: {
    grantId: string;
    clientId: string;
    encryptionKey: string;
    userId: number;
    accountId: number;
    resources: ProductGrantResource[];
}): Promise<{ id: string }> {
    return await db.knex.transaction(async (trx) => {
        const providerGrantIdHash = hashOAuthIdentifier(grantId, encryptionKey);
        const clientIdHash = hashOAuthIdentifier(clientId, encryptionKey);
        const existing = await trx(OAUTH_PRODUCT_GRANTS_TABLE).where({ provider_grant_id_hash: providerGrantIdHash }).forUpdate().first<ProductGrantRow>();
        if (existing) {
            if (
                existing.status === 'revoked' ||
                existing.user_id !== userId ||
                existing.account_id !== accountId ||
                !existing.client_id_hash.equals(clientIdHash)
            ) {
                throw new Error('Existing OAuth product grant binding does not match the current session');
            }
            return { id: existing.id };
        }

        const [grant] = await trx(OAUTH_PRODUCT_GRANTS_TABLE)
            .insert({
                provider_grant_id_hash: providerGrantIdHash,
                client_id_hash: clientIdHash,
                user_id: userId,
                account_id: accountId,
                status: 'pending',
                expires_at: new Date(Date.now() + OAUTH_GRANT_TTL_SECONDS * 1000),
                created_at: new Date(),
                updated_at: new Date()
            })
            .returning<Pick<ProductGrantRow, 'id'>[]>('id');
        if (!grant) throw new Error('Failed to reserve OAuth product grant');

        await trx(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE).insert(
            resources.map((resource) => ({ grant_id: grant.id, resource: resource.resource, scopes: resource.scopes }))
        );
        return { id: grant.id };
    });
}

export async function activateProductGrant(id: string, resources: ProductGrantResource[]): Promise<void> {
    await db.knex.transaction(async (trx) => {
        const grant = await trx(OAUTH_PRODUCT_GRANTS_TABLE).where({ id }).forUpdate().first<Pick<ProductGrantRow, 'status'>>('status');
        if (!grant || grant.status === 'revoked') throw new Error('OAuth product grant could not be activated');

        for (const resource of resources) {
            const existing = await trx(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE)
                .where({ grant_id: id, resource: resource.resource })
                .first<{ scopes: string[] }>('scopes');
            const scopes = [...new Set([...(existing?.scopes ?? []), ...resource.scopes])];
            await trx(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE)
                .insert({ grant_id: id, resource: resource.resource, scopes })
                .onConflict(['grant_id', 'resource'])
                .merge({ scopes });
        }

        if (grant.status === 'pending') {
            const now = new Date();
            await trx(OAUTH_PRODUCT_GRANTS_TABLE).where({ id, status: 'pending' }).update({ status: 'active', activated_at: now, updated_at: now });
        }
    });
}

export async function revokeProductGrantByProviderId(grantId: string, encryptionKey: string, reason: string): Promise<RevokedProductGrant | null> {
    return await db.knex.transaction(async (trx) => {
        const hash = hashOAuthIdentifier(grantId, encryptionKey);
        const grant = await trx(OAUTH_PRODUCT_GRANTS_TABLE)
            .where({ provider_grant_id_hash: hash })
            .whereIn('status', ['pending', 'active'])
            .forUpdate()
            .first<ProductGrantRow>();
        if (!grant) return null;
        const [user, resources] = await Promise.all([
            trx('_nango_users').where({ id: grant.user_id, account_id: grant.account_id }).first<{ email: string }>('email'),
            trx(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE).where({ grant_id: grant.id }).select<{ resource: string; scopes: string[] }[]>('resource', 'scopes')
        ]);
        if (!user) throw new Error('OAuth product grant user binding is unavailable');
        await markProductGrantsRevoked(trx(OAUTH_PRODUCT_GRANTS_TABLE).where({ id: grant.id }), reason);
        return {
            id: grant.id,
            accountId: grant.account_id,
            userId: grant.user_id,
            userEmail: user.email,
            resources
        };
    });
}

export async function compensateProductGrant(id: string, grantId: string, encryptionKey: string, reason: string): Promise<void> {
    await db.knex.transaction(async (trx) => {
        await markProductGrantsRevoked(trx(OAUTH_PRODUCT_GRANTS_TABLE).where({ id }), reason);
    });
    await revokeOAuthGrantByHash({ knex: db.knex, encryptionKey, grantIdHash: hashOAuthIdentifier(grantId, encryptionKey), reason });
}

export async function revokeUserProductGrants(userId: number, reason: string, trx: Knex = db.knex): Promise<RevokedUserProductGrant[]> {
    const rows = await trx(OAUTH_PRODUCT_GRANTS_TABLE)
        .where({ user_id: userId })
        .whereIn('status', ['pending', 'active'])
        .forUpdate()
        .select<Pick<ProductGrantRow, 'id' | 'account_id' | 'user_id' | 'provider_grant_id_hash'>[]>('id', 'account_id', 'user_id', 'provider_grant_id_hash');
    if (rows.length === 0) return [];

    const resources = await trx(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE)
        .whereIn(
            'grant_id',
            rows.map((row) => row.id)
        )
        .select<{ grant_id: string; resource: string; scopes: string[] }[]>('grant_id', 'resource', 'scopes');

    const now = new Date();
    await trx(OAUTH_PRODUCT_GRANTS_TABLE)
        .whereIn(
            'id',
            rows.map((row) => row.id)
        )
        .update({ status: 'revoked', revoked_at: now, revocation_reason: reason, updated_at: now });
    return rows.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        userId: row.user_id,
        providerGrantIdHash: row.provider_grant_id_hash,
        resources: resources.filter((resource) => resource.grant_id === row.id).map(({ resource, scopes }) => ({ resource, scopes }))
    }));
}

export async function revokeProviderArtifacts(grantHashes: Buffer[], encryptionKey: string, reason: string): Promise<void> {
    for (const grantIdHash of grantHashes) {
        await revokeOAuthGrantByHash({ knex: db.knex, encryptionKey, grantIdHash, reason });
    }
}

export async function cleanupStalePendingProductGrants(encryptionKey: string, limit: number): Promise<number> {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    const hashes = await db.knex.transaction(async (trx) => {
        const rows = await trx(OAUTH_PRODUCT_GRANTS_TABLE)
            .where({ status: 'pending' })
            .where('created_at', '<=', staleBefore)
            .orderBy('created_at', 'asc')
            .limit(limit)
            .forUpdate()
            .skipLocked()
            .select<Pick<ProductGrantRow, 'id' | 'provider_grant_id_hash'>[]>('id', 'provider_grant_id_hash');
        if (rows.length === 0) return [];

        const now = new Date();
        await trx(OAUTH_PRODUCT_GRANTS_TABLE)
            .whereIn(
                'id',
                rows.map((row) => row.id)
            )
            .update({ status: 'revoked', revoked_at: now, revocation_reason: 'stale_pending', updated_at: now });
        return rows.map((row) => row.provider_grant_id_hash);
    });

    await revokeProviderArtifacts(hashes, encryptionKey, 'stale_pending');
    return hashes.length;
}

async function markProductGrantsRevoked(query: Knex.QueryBuilder, reason: string): Promise<number> {
    const now = new Date();
    return await query.whereIn('status', ['pending', 'active']).update({
        status: 'revoked',
        revoked_at: now,
        revocation_reason: reason,
        updated_at: now
    });
}
