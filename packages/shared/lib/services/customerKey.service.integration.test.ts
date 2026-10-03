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

    it('does not orphan a shared key when both of its environments are hard-deleted concurrently', async () => {
        const account = await createAccount();
        const envA = await createEnvironmentSeed(account.id, 'race-a');
        const envB = await createEnvironmentSeed(account.id, 'race-b');

        const created = await customerKeyService.createApiKey(db.knex, {
            accountId: account.id,
            environmentId: envA.id,
            displayName: 'race-key'
        });
        if (created.isErr()) {
            throw created.error;
        }
        const keyId = created.value.id;
        await db.knex<DBCustomerKeyRelation>('customer_keys_relations').insert({
            customer_key_id: keyId,
            entity_type: 'environment',
            entity_id: envB.id
        });

        // Holds envA's deletion transaction open on its own connection while envB's deletion
        // runs concurrently on another, forcing the two trigger invocations to interleave —
        // this is what let both of them see the other's not-yet-committed relation removal and
        // skip the key delete before the FOR UPDATE lock was added.
        await Promise.all([
            db.knex.transaction(async (trx) => {
                await trx('_nango_environments').where({ id: envA.id }).delete();
                await trx.raw('SELECT pg_sleep(0.5)');
            }),
            (async () => {
                await new Promise((resolve) => setTimeout(resolve, 100));
                await db.knex('_nango_environments').where({ id: envB.id }).delete();
            })()
        ]);

        const key = await db.knex<DBCustomerKey>('customer_keys').where({ id: keyId }).first();
        const relations = await db.knex<DBCustomerKeyRelation>('customer_keys_relations').where({ customer_key_id: keyId });

        // The key must never end up in a limbo state: either it's gone with no relations left,
        // or it's still there because at least one relation survived.
        if (key) {
            expect(relations.length).toBeGreaterThan(0);
        } else {
            expect(relations).toStrictEqual([]);
        }
    });
});
