import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { PROD_ENVIRONMENT_NAME, configService, environmentService, getProvider, seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { Sync } from '@nangohq/shared';
import type { DBConnection, DBSyncConfig } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/environments';

describe(`DELETE ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should not allow deleting prod environment', async () => {
        const { account } = await seeders.seedAccountEnvAndUser();
        const prodEnv = await environmentService.createEnvironment(account.id, PROD_ENVIRONMENT_NAME);
        if (!prodEnv) {
            throw new Error('Failed to create prod environment');
        }

        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: PROD_ENVIRONMENT_NAME },
            token: prodEnv.secret_key
        });

        expect(res.res.status).toBe(400);
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'cannot_delete_prod_environment',
                message: 'Cannot delete prod environment'
            }
        });
    });

    it('should successfully delete a non-prod environment', async () => {
        const { account } = await seeders.seedAccountEnvAndUser();
        const testEnv = await environmentService.createEnvironment(account.id, 'test-delete');
        if (!testEnv) {
            throw new Error('Failed to create test environment');
        }

        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: testEnv.name },
            token: testEnv.secret_key
        });

        expect(res.res.status).toBe(204);

        // Verify the environment was actually deleted
        const deletedEnv = await environmentService.getById(testEnv.id);
        expect(deletedEnv).toBeNull();
    });

    it('should soft delete configs, syncConfigs and syncs when environment is deleted', async () => {
        // Seed account, environment, and user
        const { account } = await seeders.seedAccountEnvAndUser();
        const testEnv = await environmentService.createEnvironment(account.id, 'test-delete-related');
        if (!testEnv) {
            throw new Error('Failed to create test environment');
        }

        // Create a provider config for this environment
        const providerName = 'github';
        const provider = getProvider(providerName);
        if (!provider) {
            throw new Error(`Provider ${providerName} not found`);
        }

        const providerConfig = await configService.createProviderConfig(
            {
                environment_id: testEnv.id,
                unique_key: providerName,
                provider: providerName
            },
            provider
        );

        expect(providerConfig).not.toBeNull();

        // Create a syncConfig for this config
        const syncName = 'test-sync';
        const syncConfig = (
            await db.knex
                .from<DBSyncConfig>('_nango_sync_configs')
                .insert({
                    environment_id: testEnv.id,
                    sync_name: syncName,
                    file_location: 'test-location',
                    type: 'sync',
                    active: true,
                    enabled: true,
                    models: [],
                    auto_start: true,
                    deleted: false,
                    nango_config_id: providerConfig!.id!,
                    version: '1'
                })
                .returning('*')
        )[0];
        expect(syncConfig).not.toBeNull();

        // Create a connection for our sync
        const connection = (
            await db.knex
                .from<DBConnection>('_nango_connections')
                .insert({
                    environment_id: testEnv.id,
                    connection_id: 'test-connection-id',
                    provider_config_key: providerName,
                    config_id: providerConfig!.id!,
                    deleted: false,
                    credentials: {}
                })
                .returning('*')
        )[0];
        expect(connection).not.toBeNull();

        // Create a sync for this connection and syncConfig
        const sync = (
            await db.knex
                .from<Sync>('_nango_syncs')
                .insert({
                    id: randomUUID(),
                    nango_connection_id: connection!.id,
                    name: syncName,
                    variant: 'base',
                    sync_config_id: syncConfig!.id,
                    deleted: false
                })
                .returning('*')
        )[0];
        expect(sync).not.toBeNull();

        // Now delete the environment
        const res = await api.fetch(endpoint, {
            method: 'DELETE',
            // @ts-expect-error query params are required
            query: { env: testEnv.name },
            token: testEnv.secret_key
        });

        expect(res.res.status).toBe(204);

        // Verify the environment was deleted
        const deletedEnv = await environmentService.getById(testEnv.id);
        expect(deletedEnv).toBeNull();

        // Verify that config was soft deleted
        const deletedConfig = await db.knex
            .from('_nango_configs')
            .where({
                id: providerConfig!.id,
                deleted: true
            })
            .first();
        expect(deletedConfig).not.toBeNull();

        // Verify that syncConfig was soft deleted by checking it doesn't show up in active configs
        const deletedSyncConfig = await db.knex
            .from('_nango_sync_configs')
            .where({
                id: syncConfig!.id,
                deleted: true
            })
            .first();
        expect(deletedSyncConfig).not.toBeNull();

        // Verify that sync was soft deleted
        const deletedSync = await db.knex
            .from('_nango_syncs')
            .where({
                id: sync!.id,
                deleted: true
            })
            .first();
        expect(deletedSync).not.toBeNull();
    });
});
