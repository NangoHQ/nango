import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { runServer, shouldBeProtected, isError, isSuccess } from '../../utils/tests.js';
import { seeders } from '@nangohq/shared';
import db, { multipleMigrations } from '@nangohq/database';
import type { DBEnvironment } from '@nangohq/types';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import * as endUserService from '../../services/endUser.service.js';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connect/sessions';

describe(`POST ${endpoint}`, () => {
    let seed: { env: DBEnvironment };

    beforeAll(async () => {
        await multipleMigrations();
        await migrateKeystore(db.knex);
        seed = await seeders.seedAccountEnvAndUser();
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error on purpose
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should fail if no endUser', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            // @ts-expect-error on purpose
            body: {}
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_type', message: 'Required', path: ['end_user'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should fail if no endUserId or email', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                // @ts-expect-error on purpose
                end_user: {}
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Required', path: ['end_user', 'id'] },
                    { code: 'invalid_type', message: 'Required', path: ['end_user', 'email'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should return new connectSessionToken', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                end_user: { id: 'someId', email: 'a@b.com', display_name: 'Mr AB' },
                organization: { id: 'orgId', display_name: 'OrgName' }
            }
        });
        isSuccess(res.json);
    });

    it('should update the end user if needed', async () => {
        // first request create an end user
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' } }
        });
        isSuccess(res.json);

        // second request with same endUserId update the end user
        const newEmail = 'x@y.com';
        const newDisplayName = 'Mr XY';
        const newOrgId = 'orgId';
        const newOrgDisplayName = 'OrgName';
        const res2 = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                end_user: {
                    id: endUserId,
                    email: newEmail,
                    display_name: newDisplayName
                },
                organization: { id: newOrgId, display_name: newOrgDisplayName }
            }
        });
        isSuccess(res2.json);
        const getEndUser = await endUserService.getEndUser(db.knex, {
            endUserId: endUserId,
            accountId: seed.env.account_id,
            environmentId: seed.env.id
        });
        const endUser = getEndUser.unwrap();
        expect(endUser.email).toBe(newEmail);
        expect(endUser.displayName).toBe(newDisplayName);
        expect(endUser.organization?.organizationId).toBe(newOrgId);
        expect(endUser.organization?.displayName).toBe(newOrgDisplayName);
    });
});
