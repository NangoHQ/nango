import db from '../../../packages/database/lib/index.js';
import { createEndUser, seeders } from '../../../packages/shared/lib/index.js';

import type { EndUser } from '@nangohq/types';

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

async function seed() {
    const { account, env } = await seeders.seedAccountEnvAndUser();
    const providerKey = `backfill-tags-${Date.now()}`;
    await seeders.createConfigSeed(env, providerKey, 'github');

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
        provider: providerKey,
        endUser: specialEndUser,
        tags: {}
    });

    const overrideEndUser = await createCustomEndUser({
        accountId: account.id,
        environmentId: env.id,
        endUserId: 'user-override',
        email: 'original@example.com'
    });
    const overrideConn = await seeders.createConnectionSeed({
        env,
        provider: providerKey,
        endUser: overrideEndUser,
        tags: { end_user_email: 'override@example.com', custom: 'keep' }
    });

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
        provider: providerKey,
        endUser: tooManyTagsEndUser,
        tags: { existing: 'yes' }
    });

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
        provider: providerKey,
        endUser: tooLongValueEndUser,
        tags: { existing: 'yes' }
    });

    const noEndUserConn = await seeders.createConnectionSeed({
        env,
        provider: providerKey,
        tags: { existing: 'yes' }
    });

    console.log('Seeded connection tags test data');
    console.log(`Account ID: ${account.id}`);
    console.log(`Environment ID: ${env.id}`);
    console.log(`Provider key: ${providerKey}`);
    console.log(`Special connection ID: ${specialConn.id}`);
    console.log(`Override connection ID: ${overrideConn.id}`);
    console.log(`Too-many-tags connection ID: ${tooManyTagsConn.id}`);
    console.log(`Too-long-value connection ID: ${tooLongValueConn.id}`);
    console.log(`No-end-user connection ID: ${noEndUserConn.id}`);
}

seed()
    .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await db.destroy();
    });
