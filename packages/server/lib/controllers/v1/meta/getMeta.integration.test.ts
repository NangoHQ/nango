import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { seeders } from '@nangohq/shared';

import { envs } from '../../../env.js';
import { authenticateUser, isSuccess, runServer, shouldBeProtected } from '../../../utils/tests.js';

const route = '/api/v1/meta';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '';
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = 0;
    });

    it('should be protected', async () => {
        // @ts-expect-error type declares `env` but the controller rejects any query param
        const res = await api.fetch(route, { method: 'GET' });
        shouldBeProtected(res);
    });

    it('returns billingUsageSource=orb by default', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        // @ts-expect-error type declares `env` but the controller rejects any query param
        const res = await api.fetch(route, { method: 'GET', session });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.billingUsageSource).toBe('orb');
    });

    it('returns billingUsageSource=clickhouse when the account is in the rollout allowlist', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = String(account.id);
        const session = await authenticateUser(api, user);
        // @ts-expect-error type declares `env` but the controller rejects any query param
        const res = await api.fetch(route, { method: 'GET', session });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.billingUsageSource).toBe('clickhouse');
    });
});
