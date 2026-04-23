import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

import type { BillingCustomer, BillingInvoicingDetails } from '@nangohq/types';

const route = '/api/v1/plans/billing/invoicing';
let api: Awaited<ReturnType<typeof runServer>>;

let putCustomerSpy: any;

const mockCustomer: BillingCustomer = {
    id: 'orb_cust_123',
    invoicingDetails: {
        legalEntityName: 'Acme Corp',
        email: 'billing@acme.com',
        address: null,
        taxId: null
    },
    portalUrl: null
};

const validBody: BillingInvoicingDetails = {
    legalEntityName: 'Acme Corp',
    email: 'billing@acme.com',
    address: null,
    taxId: null
};

describe(`PUT ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        putCustomerSpy = vi.spyOn(billing, 'putCustomer');
    });

    afterAll(() => {
        api.server.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        putCustomerSpy.mockResolvedValue(Ok(mockCustomer));
    });

    describe('Authentication & Authorization', () => {
        it('should be protected', async () => {
            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                body: validBody
            });

            shouldBeProtected(res);
        });

        it('should enforce env query param', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'PUT',
                token: apiKey.secret,
                // @ts-expect-error missing env on purpose
                query: {},
                body: validBody
            });

            shouldRequireQueryEnv(res);
        });
    });

    describe('Input Validation', () => {
        it('should reject extra fields', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                // @ts-expect-error extra field on purpose
                body: { ...validBody, unknownField: true }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject invalid email', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                body: { ...validBody, email: 'not-an-email' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject extra params in query', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();
            const res = await api.fetch(route, {
                method: 'PUT',
                // @ts-expect-error extra query param on purpose
                query: { env: 'dev', extra: 'param' },
                token: apiKey.secret,
                body: validBody
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });

        it('should reject a body with missing required fields', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                // @ts-expect-error partial body on purpose
                body: { legalEntityName: 'Acme Corp' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });
    });

    describe('Success Cases', () => {
        it('should replace all invoicing details', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const body: BillingInvoicingDetails = {
                legalEntityName: 'Acme Corp',
                email: 'billing@acme.com',
                address: { line1: '123 Main St', line2: null, city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' },
                taxId: { country: 'US', type: 'us_ein', value: '12-3456789' }
            };
            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                body
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(putCustomerSpy).toHaveBeenCalledWith(expect.any(Number), body);
        });

        it('should allow null address and taxId', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                body: validBody
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(putCustomerSpy).toHaveBeenCalledWith(expect.any(Number), validBody);
        });
    });

    describe('Error Handling', () => {
        it('should return 400 if invalid tax id data is provided', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: null });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                body: { ...validBody, taxId: { type: 'foobar', value: '', country: 'baz' } }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 if team has no orb_customer_id', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: null });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                body: validBody
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 500 if billing.putCustomer fails', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            putCustomerSpy.mockResolvedValue(Err(new Error('Orb API error')));

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                token: apiKey.secret,
                body: validBody
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });
    });
});
