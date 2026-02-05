import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
    // Track created records for cleanup
    const createdConnectionIds: number[] = [];
    const createdEndUserIds: number[] = [];
    let createdConfigId: number;
    let createdEnvId: number;
    let createdAccountId: number;

    beforeAll(async () => {
        await multipleMigrations();
    });

    afterAll(async () => {
        // Delete in reverse order of foreign key dependencies
        if (createdConnectionIds.length > 0) {
            await db.knex('_nango_connections').whereIn('id', createdConnectionIds).del();
        }
        if (createdEndUserIds.length > 0) {
            await db.knex('end_users').whereIn('id', createdEndUserIds).del();
        }
        if (createdConfigId) {
            await db.knex('_nango_configs').where('id', createdConfigId).del();
        }
        if (createdEnvId) {
            await db.knex('_nango_environments').where('id', createdEnvId).del();
        }
        if (createdAccountId) {
            await db.knex('_nango_accounts').where('id', createdAccountId).del();
        }
    });

    it('backfills tags with edge cases', async () => {
        const account = await createTestAccount();
        createdAccountId = account.id;

        const env = await createTestEnvironment(account.id);
        createdEnvId = env.id;

        const config = await createTestConfig(env.id, 'github', 'github');
        createdConfigId = config.id;

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
        createdEndUserIds.push(specialEndUser.id);

        const specialConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            endUser: specialEndUser,
            tags: {}
        });
        createdConnectionIds.push(specialConn.id);
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
        createdEndUserIds.push(overrideEndUser.id);

        const overrideConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            endUser: overrideEndUser,
            tags: { end_user_email: 'override@example.com', custom: 'keep' }
        });
        createdConnectionIds.push(overrideConn.id);
        const expectedOverrideTags = {
            end_user_id: 'user-override',
            end_user_email: 'override@example.com',
            custom: 'keep'
        };

        // Test case 3: Truncate too-long keys and values from end_user.tags
        const longKey = 'a'.repeat(70);
        const longKeyTruncated = 'a'.repeat(64);
        const longValue = 'b'.repeat(300);
        const longValueTruncated = 'b'.repeat(255);
        const longEndUser = await createTestEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-long',
            email: 'long@example.com',
            tags: {
                [longKey]: longValue
            }
        });
        createdEndUserIds.push(longEndUser.id);

        const longConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            endUser: longEndUser,
            tags: {}
        });
        createdConnectionIds.push(longConn.id);
        const expectedLongTags = {
            end_user_id: 'user-long',
            end_user_email: 'long@example.com',
            [longKeyTruncated]: longValueTruncated
        };

        // Test case 4: Skip invalid end_user.tags keys (format)
        const invalidKeyEndUser = await createTestEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-invalid-keys',
            email: 'invalid-keys@example.com',
            tags: {
                '123bad': 'v1',
                _bad: 'v2',
                '-bad': 'v3',
                'bad key': 'v4',
                'bad@key': 'v5',
                'bad:key': 'v6',
                'good/tag': 'ok',
                'Good.Tag': 'keep'
            }
        });
        createdEndUserIds.push(invalidKeyEndUser.id);

        const invalidKeyConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            endUser: invalidKeyEndUser,
            tags: {}
        });
        createdConnectionIds.push(invalidKeyConn.id);
        const expectedInvalidKeyTags = {
            end_user_id: 'user-invalid-keys',
            end_user_email: 'invalid-keys@example.com',
            'good/tag': 'ok',
            'good.tag': 'keep'
        };

        // Test case 5: Too many keys -> drop end_user.tags, keep end_user/organization tags
        const tooManyKeysEndUser = await createTestEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-too-many',
            email: 'too-many@example.com',
            displayName: 'Too Many',
            organization: { organizationId: 'org-too-many', displayName: 'Org Too Many' },
            tags: {
                tag1: '1',
                tag2: '2',
                tag3: '3',
                tag4: '4',
                tag5: '5',
                tag6: '6'
            }
        });
        createdEndUserIds.push(tooManyKeysEndUser.id);

        const tooManyKeysConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            endUser: tooManyKeysEndUser,
            tags: {}
        });
        createdConnectionIds.push(tooManyKeysConn.id);
        const expectedTooManyKeysTags = {
            end_user_id: 'user-too-many',
            end_user_email: 'too-many@example.com',
            end_user_display_name: 'Too Many',
            organization_id: 'org-too-many',
            organization_display_name: 'Org Too Many'
        };

        // Test case 6: Connection without end_user should not be affected
        const noEndUserConn = await createTestConnection({
            environmentId: env.id,
            configId: config.id,
            providerConfigKey: 'github',
            tags: { existing: 'yes' }
        });
        createdConnectionIds.push(noEndUserConn.id);

        await db.knex.raw(buildConnectionTagsBackfillUpdateSql());

        await expect(getConnectionTags(specialConn.id)).resolves.toEqual(expectedSpecialTags);
        await expect(getConnectionTags(overrideConn.id)).resolves.toEqual(expectedOverrideTags);
        await expect(getConnectionTags(longConn.id)).resolves.toEqual(expectedLongTags);
        await expect(getConnectionTags(invalidKeyConn.id)).resolves.toEqual(expectedInvalidKeyTags);
        await expect(getConnectionTags(tooManyKeysConn.id)).resolves.toEqual(expectedTooManyKeysTags);
        await expect(getConnectionTags(noEndUserConn.id)).resolves.toEqual({ existing: 'yes' });
    });
});
