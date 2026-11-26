import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { getRedis, getRedisUrl } from '@nangohq/kvstore';
import { accountService, seeders } from '@nangohq/shared';

import { envs } from '../env.js';
import { runServer } from '../utils/tests.js';
import { loadEnvironmentUuidsWithIntegrations } from './webhook-ingress-ratelimit.middleware.js';

describe('webhook ingress rate limit', () => {
    let api: Awaited<ReturnType<typeof runServer>>;

    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(async () => {
        api.server.close();
        // The unknown-environment budget is shared by the whole process, so don't leave it drained for other suites
        const url = getRedisUrl();
        if (url) {
            await (await getRedis(url)).del('webhook-ingress-unknown-env:unknown-environments');
        }
    });

    it('snapshots only live environments that have a live integration', async () => {
        const { env: withIntegration } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(withIntegration, 'github', 'github');

        const { env: withoutIntegration } = await seeders.seedAccountEnvAndUser();

        const { env: deletedEnv } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(deletedEnv, 'github', 'github');
        await db.knex.from('_nango_environments').where({ id: deletedEnv.id }).update({ deleted: true });

        const { env: deletedIntegration } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(deletedIntegration, 'github', 'github');
        await db.knex.from('_nango_configs').where({ environment_id: deletedIntegration.id }).update({ deleted: true });

        const uuids = new Set(await loadEnvironmentUuidsWithIntegrations());

        expect(uuids.has(withIntegration.uuid)).toBe(true);
        expect(uuids.has(withoutIntegration.uuid)).toBe(false);
        expect(uuids.has(deletedEnv.uuid)).toBe(false);
        expect(uuids.has(deletedIntegration.uuid)).toBe(false);
    });

    it('rejects a flood of unknown environment ids before looking them up, without locking out a real environment', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const post = (environmentUuid: string, providerConfigKey: string) =>
            fetch(`${api.url}/webhook/${environmentUuid}/${providerConfigKey}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ hello: 'world' })
            });

        expect((await post(env.uuid, 'github')).status).not.toBe(429);

        const lookup = vi.spyOn(accountService, 'getAccountContext');
        const flood: string[] = Array.from({ length: envs.NANGO_WEBHOOK_INGRESS_UNKNOWN_ENVIRONMENT_RATE_LIMIT_PER_MIN + 10 }, () => randomUUID());
        const statuses: number[] = [];
        for (const id of flood) {
            statuses.push((await post(id, 'github')).status);
        }

        const lookedUp = lookup.mock.calls.map(([opts]) => ('environmentUuid' in opts ? opts.environmentUuid : null)).filter((id) => id && flood.includes(id));
        lookup.mockRestore();

        expect(lookedUp.length).toBeLessThanOrEqual(envs.NANGO_WEBHOOK_INGRESS_UNKNOWN_ENVIRONMENT_RATE_LIMIT_PER_MIN);
        expect(statuses.at(-1)).toBe(429);
        flood.forEach((id, i) => {
            if (statuses[i] === 429) {
                expect(lookedUp).not.toContain(id);
            }
        });

        expect((await post(env.uuid, 'github')).status).not.toBe(429);
    });
});
