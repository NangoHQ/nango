import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { pubsub, seeders, updatePlan } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { exec } from './lambdaKeepWarm.js';

import type { DBPlan } from '@nangohq/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_AGE_MS = 10 * DAY_MS;
const EXECUTION_WINDOW_MS = 20 * DAY_MS;

const NEW_ACCOUNT_MS = ACCOUNT_AGE_MS / 2;
const OLD_ACCOUNT_MS = ACCOUNT_AGE_MS * 2;
const RECENT_EXECUTION_MS = EXECUTION_WINDOW_MS / 2;
const STALE_EXECUTION_MS = EXECUTION_WINDOW_MS * 2;
const BETWEEN_WINDOWS_MS = (ACCOUNT_AGE_MS + EXECUTION_WINDOW_MS) / 2;

async function seedEnv({
    plan,
    accountAgeMs = OLD_ACCOUNT_MS,
    executionAgesMs = []
}: {
    plan?: Partial<DBPlan>;
    accountAgeMs?: number;
    /** One connection per entry, with last_execution_at set this many ms ago (null = never executed) */
    executionAgesMs?: (number | null)[];
}): Promise<number> {
    const seed = await seeders.seedAccountEnvAndUser();
    (await updatePlan(db.knex, { id: seed.plan.id, lambda_tenant_isolation: true, ...plan })).unwrap();
    await db
        .knex('_nango_accounts')
        .where({ id: seed.account.id })
        .update({ created_at: new Date(Date.now() - accountAgeMs) });

    if (executionAgesMs.length > 0) {
        const connectionIds = await seeders.createConnectionSeeds(seed.env);
        for (const [i, age] of executionAgesMs.entries()) {
            await db
                .knex('_nango_connections')
                .where({ id: connectionIds[i]! })
                .update({ last_execution_at: age === null ? null : new Date(Date.now() - age) });
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
    const original = {
        cronMinutes: envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES,
        accountAgeMs: envs.LAMBDA_KEEP_WARM_ACCOUNT_AGE_MS,
        executionWindowMs: envs.LAMBDA_KEEP_WARM_EXECUTION_WINDOW_MS
    };

    beforeAll(async () => {
        await multipleMigrations();
        envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES = 5;
        envs.LAMBDA_KEEP_WARM_ACCOUNT_AGE_MS = ACCOUNT_AGE_MS;
        envs.LAMBDA_KEEP_WARM_EXECUTION_WINDOW_MS = EXECUTION_WINDOW_MS;
    });

    afterAll(() => {
        envs.CRON_LAMBDA_KEEP_WARM_EVERY_MINUTES = original.cronMinutes;
        envs.LAMBDA_KEEP_WARM_ACCOUNT_AGE_MS = original.accountAgeMs;
        envs.LAMBDA_KEEP_WARM_EXECUTION_WINDOW_MS = original.executionWindowMs;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps a new free account warm', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, accountAgeMs: NEW_ACCOUNT_MS });
        expect(await warmedEnvironmentIds()).toContain(envId);
    });

    it('does not keep an old free account warm when nothing ran recently', async () => {
        const noConnections = await seedEnv({ plan: { name: 'free' } });
        const neverExecuted = await seedEnv({ plan: { name: 'free' }, executionAgesMs: [null] });
        const staleExecution = await seedEnv({ plan: { name: 'free' }, executionAgesMs: [STALE_EXECUTION_MS] });

        const warmed = await warmedEnvironmentIds();
        expect(warmed).not.toContain(noConnections);
        expect(warmed).not.toContain(neverExecuted);
        expect(warmed).not.toContain(staleExecution);
    });

    it('keeps an old free account warm when a connection in the environment ran recently', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, executionAgesMs: [STALE_EXECUTION_MS, RECENT_EXECUTION_MS] });
        expect(await warmedEnvironmentIds()).toContain(envId);
    });

    it('measures execution recency against the execution window, not the account age', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, executionAgesMs: [BETWEEN_WINDOWS_MS] });
        expect(await warmedEnvironmentIds()).toContain(envId);
    });

    it('measures account newness against the account age, not the execution window', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, accountAgeMs: BETWEEN_WINDOWS_MS });
        expect(await warmedEnvironmentIds()).not.toContain(envId);
    });

    it('only keeps the environment with the recent execution warm', async () => {
        const seed = await seeders.seedAccountEnvAndUser();
        (await updatePlan(db.knex, { id: seed.plan.id, lambda_tenant_isolation: true, name: 'free' })).unwrap();
        await db
            .knex('_nango_accounts')
            .where({ id: seed.account.id })
            .update({ created_at: new Date(Date.now() - OLD_ACCOUNT_MS) });
        const otherEnv = await seeders.createEnvironmentSeed(seed.account.id, 'prod');

        const [connectionId] = await seeders.createConnectionSeeds(seed.env);
        await db
            .knex('_nango_connections')
            .where({ id: connectionId! })
            .update({ last_execution_at: new Date(Date.now() - RECENT_EXECUTION_MS) });

        const warmed = await warmedEnvironmentIds();
        expect(warmed).toContain(seed.env.id);
        expect(warmed).not.toContain(otherEnv.id);
    });

    it('ignores deleted connections', async () => {
        const envId = await seedEnv({ plan: { name: 'free' }, executionAgesMs: [RECENT_EXECUTION_MS] });
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
