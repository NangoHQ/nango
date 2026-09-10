import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import {
    activateProductGrant,
    createPendingProductGrant,
    OAUTH_PRODUCT_GRANT_RESOURCES_TABLE,
    OAUTH_PRODUCT_GRANTS_TABLE,
    revokeProductGrantByProviderId
} from './product-grant.service.js';

const encryptionKey = Buffer.alloc(32, 'g').toString('base64');

describe('OAuth product grants', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(async () => {
        await db.knex(OAUTH_PRODUCT_GRANT_RESOURCES_TABLE).delete();
        await db.knex(OAUTH_PRODUCT_GRANTS_TABLE).delete();
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

    it('revokes the product binding first and returns bounded audit context', async () => {
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
        await expect(revokeProductGrantByProviderId(grantId, encryptionKey, 'token_revocation')).resolves.toBeNull();
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
