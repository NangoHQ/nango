import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { deleteCheckpoint, getCheckpoint, hardDeleteCheckpointsByPrefix, upsertCheckpoint } from './checkpoints.js';
import { createAccount } from '../../seeders/account.seeder.js';
import { createEnvironmentSeed } from '../../seeders/environment.seeder.js';

describe('Checkpoint service', () => {
    let environmentId: number;

    beforeAll(async () => {
        await multipleMigrations();
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        environmentId = environment.id;
    });

    describe('upsertCheckpoint', () => {
        it('should create a new checkpoint with version 1', async () => {
            const key = 'connection:1:function:1';
            const checkpoint = { cursor: 'abc123', page: 1, hasMore: true };

            const res = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint })).unwrap();

            expect(res.environment_id).toBe(environmentId);
            expect(res.key).toBe(key);
            expect(res.checkpoint).toEqual(checkpoint);
            expect(res.version).toBe(1);
            expect(res.deleted_at).toBeNull();
            expect(res.created_at).toBeDefined();
            expect(res.updated_at).toBeDefined();
        });

        it('should fail to update existing checkpoint without expectedVersion', async () => {
            const key = 'connection:2:function:2';
            const initialCheckpoint = { page: 1 };
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: initialCheckpoint })).unwrap();
            expect(created.version).toBe(1);

            const updatedCheckpoint = { page: 2, cursor: 'new-cursor' };
            const result = await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: updatedCheckpoint });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should update existing checkpoint with correct expectedVersion', async () => {
            const key = 'connection:3:function:3';
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 1 } })).unwrap();
            expect(created.version).toBe(1);

            const updatedCheckpoint = { page: 2 };
            const res = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: updatedCheckpoint, expectedVersion: 1 })).unwrap();

            expect(res.checkpoint).toEqual(updatedCheckpoint);
            expect(res.version).toBe(2);
        });

        it('should fail to update with wrong expectedVersion', async () => {
            const key = 'connection:4:function:4';
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 1 } })).unwrap();
            expect(created.version).toBe(1);

            const result = await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 2 }, expectedVersion: 99 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should fail to resurrect deleted checkpoint with wrong expectedVersion', async () => {
            const key = 'connection:5:function:5';
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 1 } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: created.version });

            // After delete, version is 2. Trying with wrong version should fail.
            const result = await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 2 }, expectedVersion: 1 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should resurrect deleted checkpoint with correct expectedVersion', async () => {
            const key = 'connection:6:function:6';
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 1 } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: created.version });

            // After delete, version is 2. Providing correct version should resurrect.
            const res = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 99 }, expectedVersion: 2 })).unwrap();

            expect(res.checkpoint).toEqual({ page: 99 });
            expect(res.deleted_at).toBeNull();
            expect(res.version).toBe(3);
        });

        it('should fail to upsert deleted checkpoint without expectedVersion', async () => {
            const key = 'connection:7:function:7';
            const initialCheckpoint = { page: 1 };
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: initialCheckpoint })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: created.version });

            // Without expectedVersion, should fail even for deleted checkpoints
            const result = await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { page: 99 } });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should reject overly long keys', async () => {
            const key = 'k'.repeat(300);
            const checkpoint = { test: true };

            const result = await upsertCheckpoint(db.knex, { environmentId, key, checkpoint });
            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_key_too_long');
            }
        });

        it('should reject invalid checkpoint format', async () => {
            const key = 'connection:7:function:7';
            const invalidCheckpoint = { nested: { key: 'value' } } as any;

            const result = await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: invalidCheckpoint });
            expect(result.isErr()).toBe(true);
        });
    });

    describe('getCheckpoint', () => {
        it('should return checkpoint if exists', async () => {
            const key = 'connection:10:function:10';
            const checkpoint = { status: 'active', count: 42 };

            await upsertCheckpoint(db.knex, { environmentId, key, checkpoint });
            const res = (await getCheckpoint(db.knex, { environmentId, key })).unwrap();

            expect(res?.checkpoint).toEqual(checkpoint);
            expect(res?.version).toBe(1);
        });

        it('should return null if checkpoint does not exist', async () => {
            const res = (await getCheckpoint(db.knex, { environmentId, key: 'connection:999:function:999' })).unwrap();
            expect(res).toBeNull();
        });

        it('should return null for deleted checkpoint', async () => {
            const key = 'connection:11:function:11';
            const checkpoint = { test: true };

            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: created.version });

            const res = (await getCheckpoint(db.knex, { environmentId, key })).unwrap();
            expect(res).toBeNull();
        });
    });

    describe('deleteCheckpoint', () => {
        it('should soft delete existing checkpoint with correct version', async () => {
            const key = 'connection:20:function:20';
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { test: true } })).unwrap();

            await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: created.version });

            const res = (await getCheckpoint(db.knex, { environmentId, key })).unwrap();
            expect(res).toBeNull();
        });

        it('should fail to delete with wrong version', async () => {
            const key = 'connection:21:function:21';
            await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { test: true } });

            const result = await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: 99 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should fail to delete non-existent checkpoint', async () => {
            const key = 'connection:888:function:888';

            const result = await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: 1 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });

        it('should fail to delete already deleted checkpoint', async () => {
            const key = 'connection:22:function:22';
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { test: true } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: created.version });

            // Try to delete again with the new version (2)
            const result = await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: 2 });

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('checkpoint_conflict');
            }
        });
    });

    describe('hardDeleteCheckpointsByPrefix', () => {
        it('should hard delete all checkpoints matching prefix', async () => {
            const key1 = 'connection:30:function:1';
            const key2 = 'connection:30:function:2';
            const key3 = 'connection:30:function:3';
            const otherKey = 'connection:99:function:1';

            await upsertCheckpoint(db.knex, { environmentId, key: key1, checkpoint: { a: 1 } });
            await upsertCheckpoint(db.knex, { environmentId, key: key2, checkpoint: { b: 2 } });
            await upsertCheckpoint(db.knex, { environmentId, key: key3, checkpoint: { c: 3 } });
            await upsertCheckpoint(db.knex, { environmentId, key: otherKey, checkpoint: { other: true } });

            const count = (await hardDeleteCheckpointsByPrefix(db.knex, { environmentId, keyPrefix: 'connection:30:' })).unwrap();

            expect(count).toBe(3);
            expect((await getCheckpoint(db.knex, { environmentId, key: key1 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, key: key2 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, key: key3 })).unwrap()).toBeNull();
            expect((await getCheckpoint(db.knex, { environmentId, key: otherKey })).unwrap()).not.toBeNull();
        });

        it('should return 0 if no checkpoints match prefix', async () => {
            const count = (await hardDeleteCheckpointsByPrefix(db.knex, { environmentId, keyPrefix: 'nonexistent:' })).unwrap();
            expect(count).toBe(0);
        });

        it('should handle special character in prefix', async () => {
            const key1 = 'connection:40_%:function:1';
            const key2 = 'connection:40AB:function:2';
            await upsertCheckpoint(db.knex, { environmentId, key: key1, checkpoint: { special: true } });
            await upsertCheckpoint(db.knex, { environmentId, key: key2, checkpoint: { special: true } });

            const count = (await hardDeleteCheckpointsByPrefix(db.knex, { environmentId, keyPrefix: 'connection:40_%:' })).unwrap();

            expect(count).toBe(1);
            expect((await getCheckpoint(db.knex, { environmentId, key: key1 })).unwrap()).toBeNull();
        });

        it('should also delete soft-deleted checkpoints', async () => {
            const key = 'connection:50:function:1';
            const created = (await upsertCheckpoint(db.knex, { environmentId, key, checkpoint: { a: 1 } })).unwrap();
            await deleteCheckpoint(db.knex, { environmentId, key, expectedVersion: created.version });

            const count = (await hardDeleteCheckpointsByPrefix(db.knex, { environmentId, keyPrefix: 'connection:50:' })).unwrap();

            expect(count).toBe(1);
        });
    });
});
