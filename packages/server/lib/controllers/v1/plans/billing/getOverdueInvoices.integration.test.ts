import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

import type { BillingCustomer } from '@nangohq/types';

const route = '/api/v1/plans/billing/overdue';
let api: Awaited<ReturnType<typeof runServer>>;

let getOverdueInvoicesSpy: any;
let getCustomerSpy: any;

const mockCustomer: BillingCustomer = {
    id: 'orb_cust_123',
    invoicingDetails: {
        legalEntityName: 'Acme Corp',
        email: 'billing@acme.com',
        additionalEmails: [],
        address: null,
        taxId: null
    },
    portalUrl: 'https://portal.withorb.com/view?token=abc'
};

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        getOverdueInvoicesSpy = vi.spyOn(billing, 'getOverdueInvoices');
        getCustomerSpy = vi.spyOn(billing, 'getCustomer');
    });

    afterAll(() => {
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        getOverdueInvoicesSpy.mockResolvedValue(Ok({ hasOverdue: false, count: 0 }));
        getCustomerSpy.mockResolvedValue(Ok(mockCustomer));
    });

    describe('Authentication & Authorization', () => {
        it('should be protected', async () => {
            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' } });

            shouldBeProtected(res);
        });

        it('should enforce env query param', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                // @ts-expect-error missing env on purpose
                query: {}
            });

            shouldRequireQueryEnv(res);
        });

        it('should reject extra params in query', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'GET',
                token: apiKey.secret,
                // @ts-expect-error extra query param on purpose
                query: { env: 'dev', extra: 'param' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });
    });

    describe('Accounts with no Orb customer', () => {
        it('should report nothing overdue without calling Orb', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: null });

            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ hasOverdue: false, count: 0, portalUrl: null });
            expect(getOverdueInvoicesSpy).not.toHaveBeenCalled();
        });
    });

    describe('Success Cases', () => {
        it('should report an overdue invoice with the portal URL', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });
            getOverdueInvoicesSpy.mockResolvedValue(Ok({ hasOverdue: true, count: 2 }));

            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ hasOverdue: true, count: 2, portalUrl: mockCustomer.portalUrl });
        });

        it('should not fetch the customer when nothing is overdue', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

            isSuccess(res.json);
            expect(res.json.data).toStrictEqual({ hasOverdue: false, count: 0, portalUrl: null });
            expect(getCustomerSpy).not.toHaveBeenCalled();
        });

        it('should still report overdue on a free plan, since a downgraded account can owe', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, name: 'free', orb_customer_id: 'orb_cust_123' });
            getOverdueInvoicesSpy.mockResolvedValue(Ok({ hasOverdue: true, count: 1 }));

            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

            isSuccess(res.json);
            expect(res.json.data.hasOverdue).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should return 500 if billing.getOverdueInvoices fails', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });
            getOverdueInvoicesSpy.mockResolvedValue(Err(new Error('Orb API error')));

            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });

        it('should keep the warning when the customer fetch fails, dropping only the portal URL', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });
            getOverdueInvoicesSpy.mockResolvedValue(Ok({ hasOverdue: true, count: 1 }));
            getCustomerSpy.mockResolvedValue(Err(new Error('Orb API error')));

            const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, token: apiKey.secret });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(res.json.data).toStrictEqual({ hasOverdue: true, count: 1, portalUrl: null });
        });
    });
});
