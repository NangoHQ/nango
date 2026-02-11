import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { deleteCheckpoint, getCheckpoint, hardDeleteCheckpoints, upsertCheckpoint } from './checkpoints.js';
import { createAccount } from '../../seeders/account.seeder.js';
import { createConfigSeed } from '../../seeders/config.seeder.js';
import { createConnectionSeed } from '../../seeders/connection.seeder.js';
import { createEnvironmentSeed } from '../../seeders/environment.seeder.js';

describe('Checkpoint service', () => {
    let environmentId: number;
    let connectionId: number;

    beforeAll(async () => {
        await multipleMigrations();
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        environmentId = environment.id;
        await createConfigSeed(environment, 'github', 'github');
        const connection = await createConnectionSeed({ env: environment, provider: 'github' });
        connectionId = connection.id;
    });

    describe('upsertCheckpoint', () => {
        it('should create a new checkpoint with version 1', async () => {
            const key = 'function:1';
            const checkpoint = { cursor: 'abc123', page: 1, hasMore: true };

            const res = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint })).unwrap();

            expect(res.environment_id).toBe(environmentId);
            expect(res.connection_id).toBe(connectionId);
            expect(res.key).toBe(key);
            expect(res.checkpoint).toEqual(checkpoint);
            expect(res.version).toBe(1);
            expect(res.deleted_at).toBeNull();
            expect(res.created_at).toBeDefined();
            expect(res.updated_at).toBeDefined();
        });

        it('should fail to update existing checkpoint without expectedVersion', async () => {
            const key = 'function:2';
            const initialCheckpoint = { page: 1 };
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: initialCheckpoint })).unwrap();
            expect(created.version).toBe(1);

            const updatedCheckpoint = { page: 2, cursor: 'new-cursor' };
            const result = await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: updatedCheckpoint });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should update existing checkpoint with correct expectedVersion', async () => {
            const key = 'function:3';
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 1 } })).unwrap();
            expect(created.version).toBe(1);

            const updatedCheckpoint = { page: 2 };
            const res = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: updatedCheckpoint, expectedVersion: 1 })).unwrap();

            expect(res.checkpoint).toEqual(updatedCheckpoint);
            expect(res.version).toBe(2);
        });

        it('should fail to update with wrong expectedVersion', async () => {
            const key = 'function:4';
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 1 } })).unwrap();
            expect(created.version).toBe(1);

            const result = await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 2 }, expectedVersion: 99 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should fail to resurrect deleted checkpoint with wrong expectedVersion', async () => {
            const key = 'function:5';
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 1 } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            // After delete, version is 2. Trying with wrong version should fail.
            const result = await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 2 }, expectedVersion: 1 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should resurrect deleted checkpoint with correct expectedVersion', async () => {
            const key = 'function:6';
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 1 } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            // After delete, version is 2. Providing correct version should resurrect.
            const res = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 99 }, expectedVersion: 2 })).unwrap();

            expect(res.checkpoint).toEqual({ page: 99 });
            expect(res.deleted_at).toBeNull();
            expect(res.version).toBe(3);
        });

        it('should fail to upsert deleted checkpoint without expectedVersion', async () => {
            const key = 'function:7';
            const initialCheckpoint = { page: 1 };
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: initialCheckpoint })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            // Without expectedVersion, should fail even for deleted checkpoints
            const result = await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { page: 99 } });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should reject overly long keys', async () => {
            const key = 'k'.repeat(300);
            const checkpoint = { test: true };

            const result = await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint });
            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_key_too_long');
            }
        });

        it('should reject invalid checkpoint format', async () => {
            const key = 'function:8';
            const invalidCheckpoint = { nested: { key: 'value' } } as any;

            const result = await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: invalidCheckpoint });
            expect(result.isErr()).toBe(true);
        });
    });

    describe('getCheckpoint', () => {
        it('should return checkpoint if exists', async () => {
            const key = 'function:10';
            const checkpoint = { status: 'active', count: 42 };

            await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint });
            const res = (await getCheckpoint(db.knex, { environmentId, connectionId, key })).unwrap();

            expect(res?.checkpoint).toEqual(checkpoint);
            expect(res?.version).toBe(1);
        });

        it('should return null if checkpoint does not exist', async () => {
            const res = (await getCheckpoint(db.knex, { environmentId, connectionId, key: 'function:999' })).unwrap();
            expect(res).toBeNull();
        });

        it('should return soft-deleted checkpoint with deleted_at set', async () => {
            const key = 'function:11';
            const checkpoint = { test: true };

            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            const res = (await getCheckpoint(db.knex, { environmentId, connectionId, key })).unwrap();
            expect(res).not.toBeNull();
            expect(res?.checkpoint).toEqual(checkpoint);
            expect(res?.deleted_at).not.toBeNull();
            expect(res?.version).toBe(2);
        });
    });

    describe('deleteCheckpoint', () => {
        it('should soft delete existing checkpoint with correct version', async () => {
            const key = 'function:20';
            const checkpoint = { test: true };
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint })).unwrap();

            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            const res = (await getCheckpoint(db.knex, { environmentId, connectionId, key })).unwrap();
            expect(res).not.toBeNull();
            expect(res?.checkpoint).toEqual(checkpoint);
            expect(res?.deleted_at).not.toBeNull();
            expect(res?.version).toBe(2);
        });

        it('should soft delete checkpoint without expectedVersion if forced', async () => {
            const key = 'function:21';
            const checkpoint = { test: true };
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint });

            // Force delete
            const result = await deleteCheckpoint(db.knex, { environmentId, connectionId, key, force: true });

            expect(result.isOk()).toBe(true);

            const res = (await getCheckpoint(db.knex, { environmentId, connectionId, key })).unwrap();
            expect(res).not.toBeNull();
            expect(res?.checkpoint).toEqual(checkpoint);
            expect(res?.deleted_at).not.toBeNull();
        });

        it('should fail to delete with wrong version', async () => {
            const key = 'function:22';
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { test: true } });

            const result = await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: 99 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should fail to delete non-existent checkpoint', async () => {
            const key = 'function:888';

            const result = await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: 1 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should fail to delete already deleted checkpoint', async () => {
            const key = 'function:23';
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { test: true } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            // Try to delete again with the new version (2)
            const result = await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: 2 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });
    });

    describe('hardDeleteCheckpoints', () => {
        it('should hard delete all checkpoints matching prefix', async () => {
            const key1 = 'function:301';
            const key2 = 'function:302';
            const key3 = 'function:303';
            const otherKey = 'function:99';

            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key1, checkpoint: { a: 1 } });
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key2, checkpoint: { b: 2 } });
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key3, checkpoint: { c: 3 } });
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: otherKey, checkpoint: { other: true } });

            const count = (await hardDeleteCheckpoints(db.knex, { environmentId, connectionId, keyPrefix: 'function:30' })).unwrap();

            expect(count).toBe(3);
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: key1 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: key2 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: key3 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: otherKey })).unwrap()).not.toBeNull();
        });

        it('should return 0 if no checkpoints match prefix', async () => {
            const count = (await hardDeleteCheckpoints(db.knex, { environmentId, connectionId, keyPrefix: 'nonexistent:' })).unwrap();
            expect(count).toBe(0);
        });

        it('should handle special character in prefix', async () => {
            const key1 = 'function:40_%';
            const key2 = 'function:40AB';
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key1, checkpoint: { special: true } });
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key2, checkpoint: { special: true } });

            const count = (await hardDeleteCheckpoints(db.knex, { environmentId, connectionId, keyPrefix: 'function:40_%' })).unwrap();

            expect(count).toBe(1);
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: key1 })).unwrap()).toBeNull();
        });

        it('should also delete soft-deleted checkpoints', async () => {
            const key = 'function:50';
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { a: 1 } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            const count = (await hardDeleteCheckpoints(db.knex, { environmentId, connectionId, keyPrefix: 'function:50' })).unwrap();

            expect(count).toBe(1);
        });

        it('should also delete soft-deleted checkpoints', async () => {
            const key = 'function:50';
            const created = (await upsertCheckpoint(db.knex, { environmentId, connectionId, key, checkpoint: { a: 1 } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, connectionId, key, expectedVersion: created.version });

            const count = (await hardDeleteCheckpoints(db.knex, { environmentId, connectionId, keyPrefix: 'function:50' })).unwrap();

            expect(count).toBe(1);
        });

        it('should delete all checkpoints for connection when no prefix provided', async () => {
            // Setup new environment and connection to avoid interfering with other tests
            const account = await createAccount();
            const environment = await createEnvironmentSeed(account.id);
            const connection = await createConnectionSeed({ env: environment, provider: 'hubspot' });
            const connectionId = connection.id;
            const environmentId = environment.id;

            const key1 = 'function:601';
            const key2 = 'function:602';
            const key3 = 'other:603';

            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key1, checkpoint: { a: 1 } });
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key2, checkpoint: { b: 2 } });
            await upsertCheckpoint(db.knex, { environmentId, connectionId, key: key3, checkpoint: { c: 3 } });

            const count = (await hardDeleteCheckpoints(db.knex, { environmentId, connectionId })).unwrap();

            expect(count).toBe(3);
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: key1 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: key2 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, connectionId, key: key3 })).unwrap()).toBeNull();
        });
    });
});
