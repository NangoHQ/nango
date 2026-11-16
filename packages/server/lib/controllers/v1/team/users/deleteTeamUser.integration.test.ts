import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { getPlan, seeders, userService } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireSessionEnv } from '../../../../utils/tests.js';

import type * as utilsModule from '@nangohq/utils';
import type { MockInstance } from 'vitest';

vi.mock('@nangohq/utils', async (importOriginal) => ({ ...(await importOriginal<typeof utilsModule>()), flagHasUsage: true }));

const route = '/api/v1/team/users/:id';
let api: Awaited<ReturnType<typeof runServer>>;
let getOrCreateCustomerSpy: MockInstance<typeof billing.getOrCreateCustomer>;
let createSubscriptionSpy: MockInstance<typeof billing.createSubscription>;
describe(`DELETE ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        getOrCreateCustomerSpy = vi.spyOn(billing, 'getOrCreateCustomer').mockResolvedValue(
            Ok({
                id: 'orb_cust_123',
                invoicingDetails: { legalEntityName: '', email: '', additionalEmails: [], address: null, taxId: null },
                portalUrl: null
            })
        );
        createSubscriptionSpy = vi
            .spyOn(billing, 'createSubscription')
            .mockResolvedValue(
                Ok({ id: 'orb_sub_123', planExternalId: 'free', hasGrowthFeatures: false, growthFeaturesEndsAt: null, growthFeaturesPriceIntervalId: null })
            );
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'DELETE', query: { env: 'dev' }, params: { id: 1 } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(route, {
            method: 'DELETE',
            session,
            params: { id: 1 },
            // @ts-expect-error missing query on purpose
            query: {}
        });

        shouldRequireSessionEnv(res);
    });

    it('should validate params', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const res = await api.fetch(route, {
            method: 'DELETE',
            query: { env: 'dev' },
            session,
            // @ts-expect-error on purpose
            params: { id: 'a' }
        });

        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_uri_params',
                errors: [{ code: 'invalid_type', message: 'Invalid input: expected number, received NaN', path: ['id'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should move the user to a new team linked to billing', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const user2 = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, { method: 'DELETE', query: { env: 'dev' }, session, params: { id: user2.id } });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);

        const movedUser = await userService.getUserById(user2.id);
        expect(movedUser?.account_id).not.toBe(account.id);

        const plan = await getPlan(db.knex, { accountId: movedUser!.account_id });
        expect(plan.unwrap()).toMatchObject({ orb_customer_id: 'orb_cust_123', orb_subscription_id: 'orb_sub_123' });
        expect(getOrCreateCustomerSpy).toHaveBeenCalledWith(movedUser!.account_id, expect.objectContaining({ email: user2.email }));
        expect(createSubscriptionSpy).toHaveBeenCalledWith(expect.objectContaining({ id: movedUser!.account_id }), 'free');
    });
});
