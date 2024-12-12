import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { runServer, shouldBeProtected, isError, isSuccess } from '../../utils/tests.js';
import { seeders } from '@nangohq/shared';
import db from '@nangohq/database';
import type { DBEnvironment } from '@nangohq/types';
import * as endUserService from '@nangohq/shared';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connect/sessions';

describe(`POST ${endpoint}`, () => {
    let seed: { env: DBEnvironment };

    beforeAll(async () => {
        api = await runServer();
        seed = await seeders.seedAccountEnvAndUser();
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

    it('should fail if no endUserId', async () => {
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
                errors: [{ code: 'invalid_type', message: 'Required', path: ['end_user', 'id'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should return new connectSessionToken', async () => {
        const endUserId = 'someId';
        const email = 'a@b.com';
        const displayName = 'Mr AB';
        const orgId = 'orgId';
        const orgDisplayName = 'OrgName';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                end_user: { id: endUserId, email, display_name: displayName },
                organization: { id: orgId, display_name: orgDisplayName }
            }
        });
        isSuccess(res.json);
        const getProfile = await endUserService.getEndUser(db.knex, {
            endUserId,
            accountId: seed.env.account_id,
            environmentId: seed.env.id
        });
        const profile = getProfile.unwrap();
        expect(profile.email).toBe(email);
        expect(profile.displayName).toBe(displayName);
        expect(profile.organization?.organizationId).toBe(orgId);
        expect(profile.organization?.displayName).toBe(orgDisplayName);
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

    it('should fail if integration does not exist in allowed_integrations', async () => {
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, allowed_integrations: ['random'] }
        });
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: 'Integration does not exist', path: ['allowed_integrations', 0] }]
            }
        });
    });

    it('should fail if integration does not exist in integrations_config_defaults', async () => {
        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, integrations_config_defaults: { random: { connection_config: {} } } }
        });
        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'custom', message: 'Integration does not exist', path: ['integrations_config_defaults', 'random'] }]
            }
        });
    });

    it('should succeed if allowed_integrations is passed and exist', async () => {
        await seeders.createConfigSeed(seed.env, 'github', 'github');

        const endUserId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { end_user: { id: endUserId, email: 'a@b.com' }, allowed_integrations: ['github'] }
        });
        isSuccess(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            data: {
                expires_at: expect.toBeIsoDate(),
                token: expect.any(String)
            }
        });
    });
});
