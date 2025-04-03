import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { getPlan, seeders } from '@nangohq/shared';

import { isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/plan/extend_trial';
let api: Awaited<ReturnType<typeof runServer>>;
describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'POST', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            token: env.secret_key,
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should validate body', async () => {
        const { env } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key,
            // @ts-expect-error on purpose
            body: { test: 1 }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'unrecognized_keys', message: "Unrecognized key(s) in object: 'test'", path: [] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    // it('should not extend trial because feature is disabled', async () => {
    //     const { env } = await seeders.seedAccountEnvAndUser();

    //     const res = await api.fetch(route, {
    //         method: 'POST',
    //         query: { env: 'dev' },
    //         token: env.secret_key
    //     });

    //     isError(res.json);
    //     expect(res.res.status).toBe(400);
    //     expect(res.json).toStrictEqual<typeof res.json>({
    //         error: { code: 'feature_disabled' }
    //     });
    // });

    it('should extend trial', async () => {
        const { env, plan } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'POST',
            query: { env: 'dev' },
            token: env.secret_key
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: { success: true }
        });

        const newPlan = (await getPlan(db.knex, { accountId: plan.account_id })).unwrap();
        expect(newPlan.trial_end_at?.getTime()).toBeGreaterThan(plan.trial_end_at!.getTime());
    });
});
