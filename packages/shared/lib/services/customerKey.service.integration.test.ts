import { v4 as uuid } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import customerKeyService from './customerKey.service.js';
import environmentService from './environment.service.js';
import { createAccount as createTestAccount } from '../seeders/account.seeder.js';

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('Customer key service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('should hard delete only system managed API keys expired before the retention window', async () => {
        const account = await createTestAccount();
        const environment = await environmentService.createEnvironment(db.knex, { accountId: account.id, name: uuid() });
        expect(environment).toBeDefined();

        const oldSystemKey = (
            await customerKeyService.createEphemeralApiKey(db.knex, {
                accountId: account.id,
                environmentId: environment!.id,
                displayName: 'old system key',
                scopes: ['environment:dryrun'],
                expiresAt: daysAgo(40)
            })
        ).unwrap();
        const recentSystemKey = (
            await customerKeyService.createEphemeralApiKey(db.knex, {
                accountId: account.id,
                environmentId: environment!.id,
                displayName: 'recent system key',
                scopes: ['environment:dryrun'],
                expiresAt: daysAgo(10)
            })
        ).unwrap();
        const activeSystemKey = (
            await customerKeyService.createEphemeralApiKey(db.knex, {
                accountId: account.id,
                environmentId: environment!.id,
                displayName: 'active system key',
                scopes: ['environment:dryrun'],
                expiresAt: new Date(Date.now() + 60 * 1000)
            })
        ).unwrap();
        const regularKey = (
            await customerKeyService.createApiKey(db.knex, {
                accountId: account.id,
                environmentId: environment!.id,
                displayName: 'regular key',
                scopes: ['environment:*']
            })
        ).unwrap();
        await db
            .knex('customer_keys')
            .where({ id: regularKey.id })
            .update({ expires_at: daysAgo(40) });

        const deleted = await customerKeyService.deleteExpiredSystemManagedApiKeys(db.knex, { olderThan: 31, limit: 10 });

        expect(deleted).toBe(1);
        const remainingRows = await db
            .knex('customer_keys')
            .select('id')
            .whereIn('id', [oldSystemKey.id, recentSystemKey.id, activeSystemKey.id, regularKey.id]);
        const remainingIds = new Set(remainingRows.map((row) => row.id));
        expect(remainingIds.has(oldSystemKey.id)).toBe(false);
        expect(remainingIds.has(recentSystemKey.id)).toBe(true);
        expect(remainingIds.has(activeSystemKey.id)).toBe(true);
        expect(remainingIds.has(regularKey.id)).toBe(true);

        const oldRelation = await db.knex('customer_keys_relations').where({ customer_key_id: oldSystemKey.id }).first();
        expect(oldRelation).toBeUndefined();
    });
});
