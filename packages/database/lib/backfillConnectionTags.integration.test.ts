import { createRequire } from 'node:module';

import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { createEndUser, seeders } from '@nangohq/shared';

import type { EndUser } from '@nangohq/types';

const require = createRequire(import.meta.url);
const { buildConnectionTagsBackfillUpdateSql } = require('./migration-helpers/backfillConnectionTagsSql.cjs');

async function createCustomEndUser({
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
    tags?: EndUser['tags'];
}): Promise<EndUser> {
    const result = await createEndUser(db.knex, {
        accountId,
        environmentId,
        endUserId,
        email,
        displayName: displayName ?? null,
        organization: organization ?? null,
        tags: tags || {}
    });

    if (result.isErr()) {
        throw result.error;
    }

    return result.value;
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
        const { account, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const specialEndUser = await createCustomEndUser({
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
        const specialConn = await seeders.createConnectionSeed({
            env,
            provider: 'github',
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

        const overrideEndUser = await createCustomEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-override',
            email: 'original@example.com'
        });
        const overrideConn = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            endUser: overrideEndUser,
            tags: { end_user_email: 'override@example.com', custom: 'keep' }
        });
        const expectedOverrideTags = {
            end_user_id: 'user-override',
            end_user_email: 'override@example.com',
            custom: 'keep'
        };

        const invalidKeyEndUser = await createCustomEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-invalid-key',
            email: 'invalid@example.com',
            tags: { '1bad': 'value' } as unknown as EndUser['tags']
        });
        const invalidKeyConn = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            endUser: invalidKeyEndUser,
            tags: { existing: 'yes' }
        });
        const expectedInvalidKeyTags = {
            end_user_id: 'user-invalid-key',
            end_user_email: 'invalid@example.com',
            existing: 'yes'
        };

        const tooManyTags = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`tag${index + 1}`, `value${index + 1}`]));
        const tooManyTagsEndUser = await createCustomEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-too-many',
            email: 'too-many@example.com',
            tags: tooManyTags as unknown as EndUser['tags']
        });
        const tooManyTagsConn = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            endUser: tooManyTagsEndUser,
            tags: { existing: 'yes' }
        });
        const expectedTooManyTags = {
            end_user_id: 'user-too-many',
            end_user_email: 'too-many@example.com',
            ...tooManyTags,
            existing: 'yes'
        };

        const tooLongValue = 'a'.repeat(201);
        const tooLongValueEndUser = await createCustomEndUser({
            accountId: account.id,
            environmentId: env.id,
            endUserId: 'user-long',
            email: 'long@example.com',
            tags: { long: tooLongValue } as unknown as EndUser['tags']
        });
        const tooLongValueConn = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            endUser: tooLongValueEndUser,
            tags: { existing: 'yes' }
        });
        const expectedTooLongValueTags = {
            end_user_id: 'user-long',
            end_user_email: 'long@example.com',
            long: tooLongValue,
            existing: 'yes'
        };

        const noEndUserConn = await seeders.createConnectionSeed({
            env,
            provider: 'github',
            tags: { existing: 'yes' }
        });

        await db.knex.raw(buildConnectionTagsBackfillUpdateSql());

        await expect(getConnectionTags(specialConn.id)).resolves.toEqual(expectedSpecialTags);
        await expect(getConnectionTags(overrideConn.id)).resolves.toEqual(expectedOverrideTags);
        await expect(getConnectionTags(invalidKeyConn.id)).resolves.toEqual(expectedInvalidKeyTags);
        await expect(getConnectionTags(tooManyTagsConn.id)).resolves.toEqual(expectedTooManyTags);
        await expect(getConnectionTags(tooLongValueConn.id)).resolves.toEqual(expectedTooLongValueTags);
        await expect(getConnectionTags(noEndUserConn.id)).resolves.toEqual({ existing: 'yes' });
    });
});
