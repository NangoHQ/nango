import { v4 as uuid } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import accountService from './account.service.js';
import environmentService from './environment.service.js';
import { createPlan } from './plans/plans.js';
import { createAccount } from '../seeders/account.seeder.js';

describe('Account service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('should retrieve account context by secretKey', async () => {
        const account = await createAccount();
        const environment = await environmentService.createEnvironment(account.id, uuid());
        const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();

        const bySecretKey = await accountService.getAccountContext({ secretKey: environment!.secret_key });

        expect(bySecretKey).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by publicKey', async () => {
        const account = await createAccount();
        const environment = await environmentService.createEnvironment(account.id, uuid());
        const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();

        const byPublicKey = await accountService.getAccountContext({ publicKey: environment!.public_key });

        expect(byPublicKey).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by environment uuid', async () => {
        const account = await createAccount();
        const environment = await environmentService.createEnvironment(account.id, uuid());
        const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();

        const byUuid = await accountService.getAccountContext({ environmentUuid: environment!.uuid });

        expect(byUuid).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by account uuid', async () => {
        const account = await createAccount();
        const environment = await environmentService.createEnvironment(account.id, uuid());
        const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();

        const byAccountUuid = await accountService.getAccountContext({ accountUuid: account.uuid, envName: environment!.name });

        expect(byAccountUuid).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by accountId and envName', async () => {
        const account = await createAccount();
        const environment = await environmentService.createEnvironment(account.id, uuid());
        const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();

        const byAccountId = await accountService.getAccountContext({ accountId: account.id, envName: environment!.name });

        expect(byAccountId).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });

    it('should retrieve account context by environmentId', async () => {
        const account = await createAccount();
        const environment = await environmentService.createEnvironment(account.id, uuid());
        const plan = (await createPlan(db.knex, { account_id: account.id, name: 'free' })).unwrap();

        const byEnvironmentId = await accountService.getAccountContext({ environmentId: environment!.id });

        expect(byEnvironmentId).toStrictEqual({
            account: {
                ...account,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            environment: {
                ...environment,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            },
            plan: {
                ...plan,
                created_at: expect.toBeIsoDateTimezone(),
                updated_at: expect.toBeIsoDateTimezone()
            }
        });
    });
});
