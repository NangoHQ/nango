import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { pubsub, seeders, updatePlan } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { exec } from './lambdaKeepWarm.js';

import type { DBPlan } from '@nangohq/types';

const DAY_MS = 24 * 60 * 60 * 1000;

async function seedEnv({
    plan,
    accountAgeDays = 60,
    executionAgesDays = []
}: {
    plan?: Partial<DBPlan>;
    accountAgeDays?: number;
    /** One connection per entry, with last_execution_at set this many days ago (null = never executed) */
    executionAgesDays?: (number | null)[];
}): Promise<number> {
    const seed = await seeders.seedAccountEnvAndUser();
    (await updatePlan(db.knex, { id: seed.plan.id, lambda_tenant_isolation: true, ...plan })).unwrap();
    await db
        .knex('_nango_accounts')
        .where({ id: seed.account.id })
        .update({ created_at: new Date(Date.now() - accountAgeDays * DAY_MS) });

    if (executionAgesDays.length > 0) {
        const connectionIds = await seeders.createConnectionSeeds(seed.env);
        for (const [i, age] of executionAgesDays.entries()) {
            await db
                .knex('_nango_connections')
                .where({ id: connectionIds[i]! })
                .update({ last_execution_at: age === null ? null : new Date(Date.now() - age * DAY_MS) });
        }
    }
    return seed.env.id;
}

async function warmedEnvironmentIds(): Promise<Set<number>> {
    const publish = vi.spyOn(pubsub.publisher, 'publish').mockResolvedValue(Ok(undefined));
    await exec();
    return new Set(publish.mock.calls.map(([event]) => (event.payload as { environmentId: number }).environmentId));
}

describe('lambdaKeepWarm cron exec', () => {
    // Ensure cron is not set to 0 so lock can be acquired.
    const originalCronMinutes = envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES;

    beforeAll(async () => {
        await multipleMigrations();
        envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES = 5;
    });

    afterAll(() => {
        envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES = originalCronMinutes;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps a new free account warm', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, accountAgeDays: 3 });
        expect(await warmedEnvironmentIds()).toContain(envId);
    });

    it('does not keep an old free account warm when nothing ran recently', async () => {
        const noConnections = await seedEnv({ plan: { name: 'free' } });
        const neverExecuted = await seedEnv({ plan: { name: 'free' }, executionAgesDays: [null] });
        const staleExecution = await seedEnv({ plan: { name: 'free' }, executionAgesDays: [20] });

        const warmed = await warmedEnvironmentIds();
        expect(warmed).not.toContain(noConnections);
        expect(warmed).not.toContain(neverExecuted);
        expect(warmed).not.toContain(staleExecution);
    });

    it('keeps an old free account warm when a connection in the environment ran recently', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, executionAgesDays: [20, 3] });
        expect(await warmedEnvironmentIds()).toContain(envId);
    });

    it('only keeps the environment with the recent execution warm', async () => {
        const seed = await seeders.seedAccountEnvAndUser();
        (await updatePlan(db.knex, { id: seed.plan.id, lambda_tenant_isolation: true, name: 'free' })).unwrap();
        await db
            .knex('_nango_accounts')
            .where({ id: seed.account.id })
            .update({ created_at: new Date(Date.now() - 60 * DAY_MS) });
        const otherEnv = await seeders.createEnvironmentSeed(seed.account.id, 'prod');

        const [connectionId] = await seeders.createConnectionSeeds(seed.env);
        await db
            .knex('_nango_connections')
            .where({ id: connectionId! })
            .update({ last_execution_at: new Date(Date.now() - 1 * DAY_MS) });

        const warmed = await warmedEnvironmentIds();
        expect(warmed).toContain(seed.env.id);
        expect(warmed).not.toContain(otherEnv.id);
    });

    it('ignores deleted connections', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, executionAgesDays: [1] });
        await db.knex('_nango_connections').where({ environment_id: envId }).update({ deleted: true, deleted_at: new Date() });

        expect(await warmedEnvironmentIds()).not.toContain(envId);
    });

    it('always keeps paid plans warm', async () => {
        const envId = await seedEnv({ plan: { name: 'pay-as-you-go' } });
        expect(await warmedEnvironmentIds()).toContain(envId);
    });

    it('skips deleted environments and plans without tenant isolation', async () => {
        const deleted = await seedEnv({ plan: { name: 'pay-as-you-go' } });
        await db.knex('_nango_environments').where({ id: deleted }).update({ deleted: true });
        const noIsolation = await seedEnv({ plan: { name: 'pay-as-you-go', lambda_tenant_isolation: false } });

        const warmed = await warmedEnvironmentIds();
        expect(warmed).not.toContain(deleted);
        expect(warmed).not.toContain(noIsolation);
    });
});
