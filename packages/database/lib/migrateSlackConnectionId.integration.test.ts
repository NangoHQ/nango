import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

const require = createRequire(import.meta.url);
const { buildSlackConnectionIdMigrationSql, buildSlackConnectionIdRollbackSql } = require('./migration-helpers/migrateSlackConnectionIdSql.cjs');

// Inline seeds to avoid circular dependency with @nangohq/shared

interface TestAccount {
    id: number;
    name: string;
    uuid: string;
}

interface TestEnvironment {
    id: number;
    account_id: number;
    name: string;
}

interface TestConfig {
    id: number;
    environment_id: number;
    unique_key: string;
    provider: string;
}

interface TestConnection {
    id: number;
    environment_id: number;
    provider_config_key: string;
    connection_id: string;
}

async function createTestAccount(): Promise<TestAccount> {
    const [account] = await db.knex
        .insert({ name: `test-account-${randomUUID()}` })
        .into('_nango_accounts')
        .returning('*');
    return account;
}

async function createTestEnvironment(accountId: number, name: string, slackNotifications = false): Promise<TestEnvironment> {
    const [env] = await db.knex.insert({ account_id: accountId, name, slack_notifications: slackNotifications }).into('_nango_environments').returning('*');
    return env;
}

async function createTestConfig(environmentId: number): Promise<TestConfig> {
    const [config] = await db.knex.insert({ environment_id: environmentId, unique_key: 'slack', provider: 'slack' }).into('_nango_configs').returning('*');
    return config;
}

async function createTestConnection({
    environmentId,
    configId,
    providerConfigKey,
    connectionId,
    deletedAt = null
}: {
    environmentId: number;
    configId: number;
    providerConfigKey: string;
    connectionId: string;
    deletedAt?: Date | null;
}): Promise<TestConnection> {
    const [connection] = await db.knex
        .insert({
            environment_id: environmentId,
            config_id: configId,
            provider_config_key: providerConfigKey,
            connection_id: connectionId,
            credentials: {},
            connection_config: {},
            deleted: deletedAt !== null,
            deleted_at: deletedAt
        })
        .into('_nango_connections')
        .returning('*');
    return connection;
}

async function getConnectionId(id: number): Promise<string | null> {
    const record = await db.knex.select('connection_id').from('_nango_connections').where({ id }).first();
    return record?.connection_id ?? null;
}

describe('Slack connection ID migration', () => {
    const createdConnectionIds: number[] = [];
    const createdConfigIds: number[] = [];
    const createdEnvIds: number[] = [];
    const createdAccountIds: number[] = [];

    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        if (createdConnectionIds.length > 0) {
            await db.knex('_nango_connections').whereIn('id', createdConnectionIds).del();
        }
        if (createdConfigIds.length > 0) {
            await db.knex('_nango_configs').whereIn('id', createdConfigIds).del();
        }
        if (createdEnvIds.length > 0) {
            await db.knex('_nango_environments').whereIn('id', createdEnvIds).del();
        }
        if (createdAccountIds.length > 0) {
            await db.knex('_nango_accounts').whereIn('id', createdAccountIds).del();
        }
    });

    it('up: migrates legacy name-based connection IDs to ID-based for slack_notifications=true envs only', async () => {
        // Admin account: where connections are stored
        const adminAccount = await createTestAccount();
        createdAccountIds.push(adminAccount.id);
        const adminEnv = await createTestEnvironment(adminAccount.id, 'prod');
        createdEnvIds.push(adminEnv.id);
        const adminConfig = await createTestConfig(adminEnv.id);
        createdConfigIds.push(adminConfig.id);

        // Customer account with slack_notifications=true — connection should be migrated
        const customerAccount = await createTestAccount();
        createdAccountIds.push(customerAccount.id);
        const customerEnv = await createTestEnvironment(customerAccount.id, 'dev', true);
        createdEnvIds.push(customerEnv.id);

        const legacyConn = await createTestConnection({
            environmentId: adminEnv.id,
            configId: adminConfig.id,
            providerConfigKey: 'slack',
            connectionId: `account-${customerAccount.uuid}-${customerEnv.name}`
        });
        createdConnectionIds.push(legacyConn.id);

        // Customer account with slack_notifications=false — connection should NOT be migrated
        const otherCustomerAccount = await createTestAccount();
        createdAccountIds.push(otherCustomerAccount.id);
        const otherCustomerEnv = await createTestEnvironment(otherCustomerAccount.id, 'dev', false);
        createdEnvIds.push(otherCustomerEnv.id);

        const notificationOffConn = await createTestConnection({
            environmentId: adminEnv.id,
            configId: adminConfig.id,
            providerConfigKey: 'slack',
            connectionId: `account-${otherCustomerAccount.uuid}-${otherCustomerEnv.name}`
        });
        createdConnectionIds.push(notificationOffConn.id);

        // Different provider_config_key — should NOT be migrated
        const otherProviderConn = await createTestConnection({
            environmentId: adminEnv.id,
            configId: adminConfig.id,
            providerConfigKey: 'github',
            connectionId: `account-${customerAccount.uuid}-${customerEnv.name}`
        });
        createdConnectionIds.push(otherProviderConn.id);

        // Deleted connection — should NOT be migrated
        // (deleted_at non-null avoids unique constraint conflict with legacyConn)
        const deletedConn = await createTestConnection({
            environmentId: adminEnv.id,
            configId: adminConfig.id,
            providerConfigKey: 'slack',
            connectionId: `account-${customerAccount.uuid}-${customerEnv.name}`,
            deletedAt: new Date()
        });
        createdConnectionIds.push(deletedConn.id);

        process.env['NANGO_ADMIN_UUID'] = adminAccount.uuid;
        await db.knex.raw(buildSlackConnectionIdMigrationSql());
        delete process.env['NANGO_ADMIN_UUID'];

        await expect(getConnectionId(legacyConn.id)).resolves.toBe(`account-${customerAccount.uuid}-${customerEnv.id}`);
        await expect(getConnectionId(notificationOffConn.id)).resolves.toBe(`account-${otherCustomerAccount.uuid}-${otherCustomerEnv.name}`);
        await expect(getConnectionId(otherProviderConn.id)).resolves.toBe(`account-${customerAccount.uuid}-${customerEnv.name}`);
        await expect(getConnectionId(deletedConn.id)).resolves.toBe(`account-${customerAccount.uuid}-${customerEnv.name}`);
    });

    it('down: is a no-op', async () => {
        // Rollback is intentionally a no-op — see buildSlackConnectionIdRollbackSql for the reasoning
        const result = await db.knex.raw(buildSlackConnectionIdRollbackSql());
        expect(result.rows[0].updated_rows).toBe(0);
    });
});
