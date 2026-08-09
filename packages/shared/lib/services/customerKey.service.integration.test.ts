import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../seeders/account.seeder.js';
import { createEnvironmentSeed } from '../seeders/environment.seeder.js';
import customerKeyService from './customerKey.service.js';
import environmentService from './environment.service.js';

import type { DBCustomerKey, DBCustomerKeyRelation } from '@nangohq/types';

describe('cleanup_customer_key_relations trigger', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('keeps a key that is still related to another environment after one of its environments is hard-deleted', async () => {
        const account = await createAccount();
        const envA = await createEnvironmentSeed(account.id, 'env-a');
        const envB = await createEnvironmentSeed(account.id, 'env-b');

        const created = await customerKeyService.createApiKey(db.knex, {
            accountId: account.id,
            environmentId: envA.id,
            displayName: 'shared-key'
        });
        if (created.isErr()) {
            throw created.error;
        }
        const keyId = created.value.id;

        // Simulates a key shared across environments: no endpoint creates this relation yet,
        // but the schema (customer_keys_relations UNIQUE(customer_key_id, entity_type, entity_id))
        // and ApiKeyPrincipal.environmentIds already support it.
        await db.knex<DBCustomerKeyRelation>('customer_keys_relations').insert({
            customer_key_id: keyId,
            entity_type: 'environment',
            entity_id: envB.id
        });

        await environmentService.hardDelete(envA.id);

        const survivingKey = await db.knex<DBCustomerKey>('customer_keys').where({ id: keyId }).first();
        expect(survivingKey).toBeDefined();
        expect(survivingKey?.id).toBe(keyId);

        const remainingRelations = await db.knex<DBCustomerKeyRelation>('customer_keys_relations').where({ customer_key_id: keyId });
        expect(remainingRelations).toStrictEqual([{ customer_key_id: keyId, entity_type: 'environment', entity_id: envB.id }]);
    });

    it('still hard-deletes a key whose only environment relation is removed', async () => {
        const account = await createAccount();
        const envOnly = await createEnvironmentSeed(account.id, 'env-only');

        const created = await customerKeyService.createApiKey(db.knex, {
            accountId: account.id,
            environmentId: envOnly.id,
            displayName: 'solo-key'
        });
        if (created.isErr()) {
            throw created.error;
        }
        const keyId = created.value.id;

        await environmentService.hardDelete(envOnly.id);

        const deletedKey = await db.knex<DBCustomerKey>('customer_keys').where({ id: keyId }).first();
        expect(deletedKey).toBeUndefined();

        const remainingRelations = await db.knex<DBCustomerKeyRelation>('customer_keys_relations').where({ customer_key_id: keyId });
        expect(remainingRelations).toStrictEqual([]);
    });
});
