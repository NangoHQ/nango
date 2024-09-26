import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { runServer, shouldBeProtected, isError, isSuccess } from '../../utils/tests.js';
import { seeders } from '@nangohq/shared';
import db, { multipleMigrations } from '@nangohq/database';
import type { DBEnvironment } from '@nangohq/types';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import * as linkedProfileService from '../../services/linkedProfile.service.js';

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

    it('should fail if no linkedProfile', async () => {
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
                errors: [{ code: 'invalid_type', message: 'Required', path: ['linkedProfile'] }]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should fail if no profileId or email', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                // @ts-expect-error on purpose
                linkedProfile: {}
            }
        });

        isError(res.json);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_type', message: 'Required', path: ['linkedProfile', 'profileId'] },
                    { code: 'invalid_type', message: 'Required', path: ['linkedProfile', 'email'] }
                ]
            }
        });
        expect(res.res.status).toBe(400);
    });

    it('should return new connectSessionToken', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { linkedProfile: { profileId: 'someId', email: 'a@b.com' } }
        });
        isSuccess(res.json);
    });

    it('should update the linked profile if needed', async () => {
        // first request create a linked profile
        const profileId = 'knownId';
        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: { linkedProfile: { profileId, email: 'a@b.com' } }
        });
        isSuccess(res.json);

        // second request with same profileId update the linked profile
        const newEmail = 'x@y.com';
        const newDisplayName = 'Mr XY';
        const newOrgId = 'orgId';
        const newOrgDisplayName = 'OrgName';
        const res2 = await api.fetch(endpoint, {
            method: 'POST',
            token: seed.env.secret_key,
            body: {
                linkedProfile: {
                    profileId,
                    email: newEmail,
                    displayName: newDisplayName,
                    organization: { id: newOrgId, displayName: newOrgDisplayName }
                }
            }
        });
        isSuccess(res2.json);
        const getProfile = await linkedProfileService.getLinkedProfile(db.knex, {
            profileId,
            accountId: seed.env.account_id,
            environmentId: seed.env.id
        });
        const profile = getProfile.unwrap();
        expect(profile.email).toBe(newEmail);
        expect(profile.displayName).toBe(newDisplayName);
        expect(profile.organization?.id).toBe(newOrgId);
        expect(profile.organization?.displayName).toBe(newOrgDisplayName);
    });
});
