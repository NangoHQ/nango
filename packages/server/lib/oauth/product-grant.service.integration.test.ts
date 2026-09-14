import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { hashOAuthIdentifier } from '@nangohq/oauth-server';
import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import {
    activateProductGrant,
    createPendingProductGrant,
    OAUTH_PRODUCT_GRANT_RESOURCES_TABLE,
    OAUTH_PRODUCT_GRANTS_TABLE,
    revokeProductGrantByProviderId,
    revokeUserProductGrants
} from './product-grant.service.js';

const encryptionKey = Buffer.alloc(32, 'g').toString('base64');
const OAUTH_SERVER_ARTIFACTS_TABLE = 'oauth_server_artifacts';

describe('OAuth product grants', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(async () => {
        await db.knex(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE).delete();
        await db.knex(OAUTH_PRODUCT_GRANTS_TABLE).delete();
        await db.knex(OAUTH_SERVER_ARTIFACTS_TABLE).delete();
    });

    it('persists a normalized multi-resource grant and activates only after provider persistence', async () => {
        const { user, account } = await createUser();
        const grantId = `provider-grant-${nanoid()}`;
        const initialResources = [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }];
        const product = await createPendingProductGrant({
            grantId,
            clientId: 'https://client.example.com/metadata.json',
            encryptionKey,
            userId: user.id,
            accountId: account.id,
            resources: initialResources
        });

        expect(await db.knex(OAUTH_PRODUCT_GRANTS_TABLE).where({ id: product.id }).first('status')).toMatchObject({ status: 'pending' });
        await activateProductGrant(product.id, initialResources);
        expect(await db.knex(OAUTH_PRODUCT_GRANTS_TABLE).where({ id: product.id }).first('status')).toMatchObject({ status: 'active' });

        const reused = await createPendingProductGrant({
            grantId,
            clientId: 'https://client.example.com/metadata.json',
            encryptionKey,
            userId: user.id,
            accountId: account.id,
            resources: [{ resource: 'https://agents.example.com/mcp', scopes: ['agent-session:*'] }]
        });
        expect(reused.id).toBe(product.id);
        await activateProductGrant(reused.id, [{ resource: 'https://agents.example.com/mcp', scopes: ['agent-session:*'] }]);

        const resources = await db.knex(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE).where({ grant_id: product.id }).orderBy('resource').select('resource', 'scopes');
        expect(resources).toEqual([
            { resource: 'https://agents.example.com/mcp', scopes: ['agent-session:*'] },
            { resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }
        ]);
    });

    it('atomically revokes the product binding and provider artifacts', async () => {
        const { user, account } = await createUser();
        const grantId = `provider-grant-${nanoid()}`;
        const product = await createPendingProductGrant({
            grantId,
            clientId: 'https://client.example.com/metadata.json',
            encryptionKey,
            userId: user.id,
            accountId: account.id,
            resources: [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }]
        });
        await activateProductGrant(product.id, [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }]);
        const grantIdHash = hashOAuthIdentifier(grantId, encryptionKey);
        const now = new Date();
        await db.knex(OAUTH_SERVER_ARTIFACTS_TABLE).insert(
            ['Grant', 'AccessToken'].map((model) => ({
                model,
                artifact_id_hash: hashOAuthIdentifier(`${model}-${nanoid()}`, encryptionKey),
                payload_encrypted: Buffer.from('test-payload'),
                grant_id_hash: grantIdHash,
                session_uid_hash: null,
                subject_id_hash: null,
                session_authenticated_at: null,
                expires_at: new Date(now.getTime() + 600_000),
                consumed_at: null,
                revoked_at: null,
                created_at: now,
                updated_at: now
            }))
        );

        await expect(revokeProductGrantByProviderId(grantId, encryptionKey, 'token_revocation')).resolves.toMatchObject({
            id: product.id,
            accountId: account.id,
            userId: user.id,
            resources: [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }]
        });
        expect(await db.knex(OAUTH_PRODUCT_GRANTS_TABLE).where({ id: product.id }).first('status', 'revocation_reason')).toMatchObject({
            status: 'revoked',
            revocation_reason: 'token_revocation'
        });
        const artifacts = await db
            .knex(OAUTH_SERVER_ARTIFACTS_TABLE)
            .where({ grant_id_hash: grantIdHash })
            .whereIn('model', ['Grant', 'AccessToken'])
            .select<{ revoked_at: Date | null }[]>('revoked_at');
        expect(artifacts).toHaveLength(2);
        expect(artifacts.every((artifact) => artifact.revoked_at !== null)).toBe(true);
        await expect(revokeProductGrantByProviderId(grantId, encryptionKey, 'token_revocation')).resolves.toBeNull();
    });

    it('rolls back product revocation when provider artifact revocation fails', async () => {
        const { user, account } = await createUser();
        const grantId = `provider-grant-${nanoid()}`;
        const product = await createPendingProductGrant({
            grantId,
            clientId: 'https://client.example.com/metadata.json',
            encryptionKey,
            userId: user.id,
            accountId: account.id,
            resources: [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }]
        });
        await activateProductGrant(product.id, [{ resource: 'https://mcp.example.com/mcp', scopes: ['environment:*'] }]);

        await expect(
            db.knex.transaction(async (trx) => await revokeUserProductGrants(user.id, 'invalid-encryption-key', 'password_reset', trx))
        ).rejects.toThrow(/encryption key/);
        expect(await db.knex(OAUTH_PRODUCT_GRANTS_TABLE).where({ id: product.id }).first('status', 'revoked_at')).toMatchObject({
            status: 'active',
            revoked_at: null
        });
    });
});

async function createUser() {
    const value = nanoid();
    const account = await accountService.createAccount({ name: `OAuth account ${value}`, email: `owner-${value}@example.com` });
    if (!account) throw new Error('Failed to create OAuth test account');
    const user = await userService.createUser({
        name: 'OAuth user',
        email: `user-${value}@example.com`,
        account_id: account.id,
        email_verified: true,
        role: 'administrator'
    });
    if (!user) throw new Error('Failed to create OAuth test user');
    return { user, account };
}
