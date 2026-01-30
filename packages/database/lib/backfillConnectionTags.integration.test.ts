import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from './index.js';

const require = createRequire(import.meta.url);
const { buildConnectionTagsBackfillUpdateSql } = require('./migration-helpers/backfillConnectionTagsSql.cjs');

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

interface TestEndUser {
    id: number;
    end_user_id: string;
    account_id: number;
    environment_id: number;
    email: string;
    display_name: string | null;
    organization_id: string | null;
    organization_display_name: string | null;
    tags: Record<string, string> | null;
}

interface TestConnection {
    id: number;
    environment_id: number;
    provider_config_key: string;
    connection_id: string;
    end_user_id: number | null;
    tags: Record<string, string>;
}

async function createTestAccount(): Promise<TestAccount> {
    const name = `test-account-${randomUUID()}`;
    const [account] = await db.knex.insert({ name }).into('_nango_accounts').returning('*');
    return account;
}

async function createTestEnvironment(accountId: number): Promise<TestEnvironment> {
    const [env] = await db.knex.insert({ account_id: accountId, name: 'dev' }).into('_nango_environments').returning('*');
    return env;
}

async function createTestConfig(environmentId: number, uniqueKey: string, provider: string): Promise<TestConfig> {
    const [config] = await db.knex
        .insert({
            environment_id: environmentId,
            unique_key: uniqueKey,
            provider: provider
        })
        .into('_nango_configs')
        .returning('*');
    return config;
}

async function createTestEndUser({
    accountId,
    environmentId,
    endUserId,
    email,
    displayName,
    organization,
    tags
}: {
    accountId: number;
    environmentId: number;
    endUserId: string;
    email: string;
    displayName?: string | null;
    organization?: { organizationId: string; displayName?: string | null } | null;
    tags?: Record<string, string>;
}): Promise<TestEndUser> {
    const [endUser] = await db.knex
        .insert({
            end_user_id: endUserId,
            account_id: accountId,
            environment_id: environmentId,
            email: email,
            display_name: displayName ?? null,
            organization_id: organization?.organizationId ?? null,
            organization_display_name: organization?.displayName ?? null,
            tags: tags ?? null
        })
        .into('end_users')
        .returning('*');
    return endUser;
}

async function createTestConnection({
    environmentId,
    configId,
    providerConfigKey,
    endUser,
    tags
}: {
    environmentId: number;
    configId: number;
    providerConfigKey: string;
    endUser?: TestEndUser;
    tags?: Record<string, string>;
}): Promise<TestConnection> {
    const connectionId = `conn-${randomUUID()}`;
    const [connection] = await db.knex
        .insert({
            environment_id: environmentId,
            config_id: configId,
            provider_config_key: providerConfigKey,
            connection_id: connectionId,
            credentials: {},
            connection_config: {},
            end_user_id: endUser?.id ?? null,
            tags: tags ?? {}
        })
        .into('_nango_connections')
        .returning('*');
    return connection;
}

async function getConnectionTags(connectionId: number) {
    const record = await db.knex.select('tags').from('_nango_connections').where({ id: connectionId }).first();
    return record?.tags ?? null;
}

describe('Connection tags backfill', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('backfills tags with edge cases', async () => {
        const account = await createTestAccount();
        const env = await createTestEnvironment(account.id);
        const config = await createTestConfig(env.id, 'github', 'github');

        // Test case 1: Special characters in all fields
        const specialEndUser = await createTestEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user id/1?=+&',
            email: 'user+test@example.com',
            displayName: 'Jane Doe (R&D)',
            organization: { organizationId: 'org:alpha/1', displayName: 'Org & Co' },
            tags: {
                project: 'R&D / alpha',
                team: 'core team',
                ip: '2001:db8::1'
            }
        });
        const specialConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            endUser: specialEndUser,
            tags: {}
        });
        const expectedSpecialTags = {
            end_user_id: 'user id/1?=+&',
            end_user_email: 'user+test@example.com',
            end_user_display_name: 'Jane Doe (R&D)',
            organization_id: 'org:alpha/1',
            organization_display_name: 'Org & Co',
            project: 'R&D / alpha',
            team: 'core team',
            ip: '2001:db8::1'
        };

        // Test case 2: Existing tags should take precedence over generated tags
        const overrideEndUser = await createTestEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-override',
            email: 'original@example.com'
        });
        const overrideConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            endUser: overrideEndUser,
            tags: { end_user_email: 'override@example.com', custom: 'keep' }
        });
        const expectedOverrideTags = {
            end_user_id: 'user-override',
            end_user_email: 'override@example.com',
            custom: 'keep'
        };

        // Test case 3: Connection without end_user should not be affected
        const noEndUserConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            tags: { existing: 'yes' }
        });

        await db.knex.raw(buildConnectionTagsBackfillUpdateSql());

        await expect(getConnectionTags(specialConn.id)).resolves.toEqual(expectedSpecialTags);
        await expect(getConnectionTags(overrideConn.id)).resolves.toEqual(expectedOverrideTags);
        await expect(getConnectionTags(noEndUserConn.id)).resolves.toEqual({ existing: 'yes' });
    });
});
