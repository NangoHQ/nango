import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../../../seeders/account.seeder.js';
import { createConfigSeed } from '../../../seeders/config.seeder.js';
import { createEnvironmentSeed } from '../../../seeders/environment.seeder.js';
import { getArtifactFileLocations, getSoftDeleted, hardDelete, safeToDeleteArtifacts, search, softDelete, upsert } from './functions.js';

import type { DBFunctionConfigVersion, FunctionTriggerDefinition } from '@nangohq/types';

function functionVersion(
    version: string,
    trigger: FunctionTriggerDefinition = { kind: 'none' }
): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: `Function ${version}`,
        file_location: `functions/${version}`,
        version,
        source: 'repo',
        trigger,
        requires: { connection: true, outbound: false, invoke: false },
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        limits: { concurrency: { perConnection: 'max' } },
        input_schema_ref: null,
        output_schema_ref: null,
        model_schema_refs: [],
        metadata_schema_ref: null,
        checkpoint_schema_ref: null,
        json_schema: { type: 'object' }
    };
}

describe(search, () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('filters functions by integration unique key', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const firstIntegration = await createConfigSeed(environment, 'github-first', 'github');
        const secondIntegration = await createConfigSeed(environment, 'github-second', 'github');

        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: firstIntegration.unique_key,
                name: 'firstFunction',
                version: functionVersion('first-version')
            }
        ]);
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: secondIntegration.unique_key,
                name: 'secondFunction',
                version: functionVersion('second-version')
            }
        ]);

        const functions = (
            await search(db.knex, {
                environmentId: environment.id,
                filter: { integrationKey: firstIntegration.unique_key }
            })
        ).unwrap();

        expect(functions).toHaveLength(1);
        expect(functions[0]).toMatchObject({
            integration: { id: firstIntegration.id, unique_key: firstIntegration.unique_key, provider: firstIntegration.provider },
            config: { nango_config_id: firstIntegration.id, name: 'firstFunction' },
            currentVersion: { version: 'first-version' }
        });
    });

    it('returns no functions for an unknown integration unique key', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github', 'github');
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'function',
                version: functionVersion('version')
            }
        ]);

        const functions = (await search(db.knex, { environmentId: environment.id, filter: { integrationKey: 'unknown' } })).unwrap();

        expect(functions).toStrictEqual([]);
    });

    it('filters functions by name', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github', 'github');

        const config = {
            environmentId: environment.id,
            integrationId: github.unique_key,
            name: 'firstFunction',
            version: functionVersion('123')
        };

        await upsert(db.knex, [config, { ...config, name: 'secondFunction', version: functionVersion('456') }]);

        const functions = (
            await search(db.knex, {
                environmentId: environment.id,
                filter: { integrationKey: github.unique_key, name: config.name }
            })
        ).unwrap();

        expect(functions).toHaveLength(1);
        expect(functions[0]).toMatchObject({
            integration: { id: github.id, unique_key: github.unique_key, provider: github.provider },
            config: { nango_config_id: github.id, name: config.name },
            currentVersion: { version: config.version.version }
        });
    });

    it('returns no functions for an unknown name', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github', 'github');
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'function',
                version: functionVersion('version')
            }
        ]);

        const functions = (await search(db.knex, { environmentId: environment.id, filter: { integrationKey: github.unique_key, name: 'unknown' } })).unwrap();

        expect(functions).toStrictEqual([]);
    });

    it('filters functions with http trigger', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github', 'github');

        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'subscribed',
                version: functionVersion('subscribed', { kind: 'http', subscriptions: ['push'] })
            }
        ]);
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'empty',
                version: functionVersion('empty', { kind: 'http', subscriptions: [] })
            }
        ]);
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'none',
                version: functionVersion('none', { kind: 'http' })
            }
        ]);
        const disabled = (
            await upsert(db.knex, [
                {
                    environmentId: environment.id,
                    integrationId: github.unique_key,
                    name: 'disabled',
                    version: functionVersion('disabled', { kind: 'http', subscriptions: ['push'] })
                }
            ])
        ).unwrap();
        await db.knex('function_configs').where({ id: disabled[0]!.config.id }).update({ enabled: false });

        const subscribed = (
            await search(db.knex, {
                environmentId: environment.id,
                filter: { integrationKey: github.unique_key, enabled: true, trigger: { kind: 'http', hasSubscriptions: true } }
            })
        ).unwrap();
        const withoutSubscriptions = (
            await search(db.knex, {
                environmentId: environment.id,
                filter: { integrationKey: github.unique_key, enabled: true, trigger: { kind: 'http', hasSubscriptions: false } }
            })
        ).unwrap();
        const disabledSubscribed = (
            await search(db.knex, {
                environmentId: environment.id,
                filter: { integrationKey: github.unique_key, enabled: false, trigger: { kind: 'http', hasSubscriptions: true } }
            })
        ).unwrap();

        expect(subscribed.map((func) => func.config.name)).toEqual(['subscribed']);
        expect(withoutSubscriptions.map((func) => func.config.name).sort()).toEqual(['empty', 'none']);
        expect(disabledSubscribed.map((func) => func.config.name)).toEqual(['disabled']);
    });

    it('does not ignore empty filter values', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github', 'github');
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'function',
                version: functionVersion('version')
            }
        ]);

        const emptyIntegrationKey = (await search(db.knex, { environmentId: environment.id, filter: { integrationKey: '' } })).unwrap();
        const emptyName = (await search(db.knex, { environmentId: environment.id, filter: { integrationKey: github.unique_key, name: '' } })).unwrap();

        expect(emptyIntegrationKey).toStrictEqual([]);
        expect(emptyName).toStrictEqual([]);
    });
});

describe('function config retention', () => {
    it('finds the oldest expired soft-deleted configs first and hard-deletes their versions', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github-retention', 'github');
        const [oldest, newer, recent] = (
            await upsert(db.knex, [
                {
                    environmentId: environment.id,
                    integrationId: github.unique_key,
                    name: 'oldestExpiredFunction',
                    version: functionVersion('oldest-expired-version')
                },
                {
                    environmentId: environment.id,
                    integrationId: github.unique_key,
                    name: 'newerExpiredFunction',
                    version: functionVersion('newer-expired-version')
                },
                {
                    environmentId: environment.id,
                    integrationId: github.unique_key,
                    name: 'recentlyDeletedFunction',
                    version: functionVersion('recently-deleted-version')
                }
            ])
        ).unwrap();
        if (!oldest || !newer || !recent) {
            throw new Error('failed_to_create_function_config');
        }
        const configIds = [oldest.config.id, newer.config.id, recent.config.id];
        await softDelete(db.knex, { environmentId: environment.id, ids: configIds });
        await db.knex
            .from('function_configs')
            .where({ id: oldest.config.id })
            .update({ deleted_at: new Date('2000-01-01') });
        await db.knex
            .from('function_configs')
            .where({ id: newer.config.id })
            .update({ deleted_at: new Date('2001-01-01') });

        const expired = (await getSoftDeleted(db.knex, { olderThanDays: 31, limit: 1000 })).unwrap();
        const expiredIds = expired.map((config) => config.id);
        expect(expiredIds).toContain(oldest.config.id);
        expect(expiredIds).toContain(newer.config.id);
        expect(expiredIds).not.toContain(recent.config.id);

        const oldestBatch = (await getSoftDeleted(db.knex, { olderThanDays: 31, limit: 1 })).unwrap();
        expect(oldestBatch.map((config) => config.id)).toStrictEqual([oldest.config.id]);

        expect((await hardDelete(db.knex, { environmentId: environment.id, ids: configIds })).unwrap()).toBe(3);
        expect(await db.knex.from('function_configs').whereIn('id', configIds)).toHaveLength(0);
        expect(await db.knex.from('function_config_versions').whereIn('function_config_id', configIds)).toHaveLength(0);
    });
});

describe(getArtifactFileLocations, () => {
    it('returns every version location, skipping local files', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github-artifacts', 'github');
        const [created] = (
            await upsert(db.knex, [
                {
                    environmentId: environment.id,
                    integrationId: github.unique_key,
                    name: 'artifactFunction',
                    version: { ...functionVersion('one'), file_location: 'remote/one.js' }
                }
            ])
        ).unwrap();
        if (!created) {
            throw new Error('failed_to_create_function_config');
        }
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'artifactFunction',
                version: { ...functionVersion('two'), file_location: '_LOCAL_FILE_' }
            }
        ]);

        expect((await getArtifactFileLocations(db.knex, { environmentId: environment.id, id: created.config.id })).unwrap()).toStrictEqual(['remote/one.js']);
    });
});

describe(safeToDeleteArtifacts, () => {
    it('adds the `.ts` sibling and drops locations a live config still points at', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github-deletable', 'github');
        await upsert(db.knex, [
            {
                environmentId: environment.id,
                integrationId: github.unique_key,
                name: 'liveFunction',
                version: { ...functionVersion('live'), file_location: 'remote/live.js' }
            }
        ]);

        const deletable = (
            await safeToDeleteArtifacts(db.knex, {
                environmentId: environment.id,
                fileLocations: ['remote/live.js', 'remote/gone.js']
            })
        ).unwrap();

        expect(deletable).toStrictEqual(['remote/gone.js', 'remote/gone.ts']);
    });

    it('drops a location that was redeployed into a live config after the deletion was scheduled', async () => {
        const account = await createAccount();
        const environment = await createEnvironmentSeed(account.id);
        const github = await createConfigSeed(environment, 'github-redeploy', 'github');
        const version = { ...functionVersion('redeployed'), file_location: 'remote/redeployed.js' };
        const [created] = (
            await upsert(db.knex, [{ environmentId: environment.id, integrationId: github.unique_key, name: 'redeployedFunction', version }])
        ).unwrap();
        if (!created) {
            throw new Error('failed_to_create_function_config');
        }

        const fileLocations = (await getArtifactFileLocations(db.knex, { environmentId: environment.id, id: created.config.id })).unwrap();

        await softDelete(db.knex, { environmentId: environment.id, ids: [created.config.id] });
        await hardDelete(db.knex, { environmentId: environment.id, ids: [created.config.id] });
        await upsert(db.knex, [{ environmentId: environment.id, integrationId: github.unique_key, name: 'redeployedFunction', version }]);

        expect((await safeToDeleteArtifacts(db.knex, { environmentId: environment.id, fileLocations })).unwrap()).toStrictEqual([]);
    });
});
