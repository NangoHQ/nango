import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { seeders, updatePlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected, shouldRequireSessionEnv } from '../../../../utils/tests.js';

import type { BillingCustomer, BillingInvoicingDetails } from '@nangohq/types';

const route = '/api/v1/plans/billing/invoicing';
let api: Awaited<ReturnType<typeof runServer>>;

let putCustomerSpy: any;

const mockCustomer: BillingCustomer = {
    id: 'orb_cust_123',
    invoicingDetails: {
        legalEntityName: 'Acme Corp',
        email: 'billing@acme.com',
        additionalEmails: [],
        address: null,
        taxId: null
    },
    portalUrl: null
};

const validBody: BillingInvoicingDetails = {
    legalEntityName: 'Acme Corp',
    email: 'billing@acme.com',
    additionalEmails: [],
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
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'PUT',
                session,
                // @ts-expect-error missing env on purpose
                query: {},
                body: validBody
            });

            shouldRequireSessionEnv(res);
        });
    });

    describe('Input Validation', () => {
        it('should reject extra fields', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                // @ts-expect-error extra field on purpose
                body: { ...validBody, unknownField: true }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject invalid email', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body: { ...validBody, email: 'not-an-email' }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject an invalid additional email', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body: { ...validBody, additionalEmails: ['ap@acme.com', 'not-an-email'] }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject more than 49 additional emails', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body: { ...validBody, additionalEmails: Array.from({ length: 50 }, (_, i) => `email${i}@acme.com`) }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject a duplicate email between email and additionalEmails', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                // Case-only duplicate of the primary email.
                body: { ...validBody, additionalEmails: ['BILLING@acme.com'] }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should reject extra params in query', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'PUT',
                // @ts-expect-error extra query param on purpose
                query: { env: 'dev', extra: 'param' },
                session,
                body: validBody
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_query_params');
        });

        it('should reject a body with missing required fields', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
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
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const body: BillingInvoicingDetails = {
                legalEntityName: 'Acme Corp',
                email: 'billing@acme.com',
                additionalEmails: ['ap@acme.com', 'finance@acme.com'],
                address: { line1: '123 Main St', line2: null, city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' },
                taxId: { country: 'US', type: 'us_ein', value: '12-3456789' }
            };
            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(putCustomerSpy).toHaveBeenCalledWith(expect.any(Number), body);
        });

        it('should accept a populated additionalEmails list', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const body: BillingInvoicingDetails = { ...validBody, additionalEmails: ['ap@acme.com', 'finance@acme.com'] };
            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(putCustomerSpy).toHaveBeenCalledWith(expect.any(Number), body);
        });

        it('should default additionalEmails to [] when omitted', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const { additionalEmails: _additionalEmails, ...bodyWithoutAdditionalEmails } = validBody;
            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                // @ts-expect-error omitting additionalEmails on purpose
                body: bodyWithoutAdditionalEmails
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(putCustomerSpy).toHaveBeenCalledWith(expect.any(Number), validBody);
        });

        it('should allow null address and taxId', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body: validBody
            });

            isSuccess(res.json);
            expect(res.res.status).toBe(200);
            expect(putCustomerSpy).toHaveBeenCalledWith(expect.any(Number), validBody);
        });
    });

    describe('Error Handling', () => {
        it('should return 400 if invalid tax id data is provided', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: null });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body: { ...validBody, taxId: { type: 'foobar', value: '', country: 'baz' } }
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 if team has no orb_customer_id', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: null });

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body: validBody
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 500 if billing.putCustomer fails', async () => {
            const { plan, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);
            await updatePlan(db.knex, { id: plan.id, orb_customer_id: 'orb_cust_123' });

            putCustomerSpy.mockResolvedValue(Err(new Error('Orb API error')));

            const res = await api.fetch(route, {
                method: 'PUT',
                query: { env: 'dev' },
                session,
                body: validBody
            });

            isError(res.json);
            expect(res.res.status).toBe(500);
            expect(res.json.error.code).toBe('server_error');
        });
    });
});
