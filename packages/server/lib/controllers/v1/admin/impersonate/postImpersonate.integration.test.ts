import * as OTPAuth from 'otpauth';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { seeders } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { authenticateUser, isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { MockInstance } from 'vitest';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/admin/impersonate';

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        flags.hasAdminCapabilities = false;
        envs.NANGO_IMPERSONATION_MFA_REQUIRED = true;
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            body: { accountUUID: 'test', loginReason: 'test' }
        });

        shouldBeProtected(res);
    });

    it('should block if admin capabilities are not enabled', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'test', loginReason: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'feature_disabled',
                message: 'Admin capabilities are not enabled'
            }
        });
    });

    it('should validate body', async () => {
        flags.hasAdminCapabilities = true;
        envs.NANGO_ADMIN_UUID = 'e1e8fee9-a459-46fe-9e82-15c93dae2406';

        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            // @ts-expect-error on purpose
            body: { accountUUID: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [
                    { code: 'invalid_format', message: 'Invalid UUID', path: ['accountUUID'] },
                    { code: 'invalid_type', message: 'Invalid input: expected string, received undefined', path: ['loginReason'] }
                ]
            }
        });
    });

    it('should ensure we are allowed to impersonate', async () => {
        flags.hasAdminCapabilities = true;
        envs.NANGO_ADMIN_UUID = 'e1e8fee9-a459-46fe-9e82-15c93dae2406'; // will not match current account

        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'forbidden', message: 'You are not authorized to impersonate an account' }
        });
    });

    it('should refuse a secret key, which has no session to challenge', async () => {
        flags.hasAdminCapabilities = true;

        const { account, apiKey } = await seeders.seedAccountEnvAndUser();
        envs.NANGO_ADMIN_UUID = account.uuid;

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test', code: '123456' }
        });

        isError(res.json);
        expect(res.res.status).toBe(401);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'forbidden', message: 'Impersonation requires a dashboard session' }
        });
    });

    it('should refuse a secret key under breakglass too', async () => {
        flags.hasAdminCapabilities = true;
        envs.NANGO_IMPERSONATION_MFA_REQUIRED = false;

        const { account, apiKey } = await seeders.seedAccountEnvAndUser();
        envs.NANGO_ADMIN_UUID = account.uuid;

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test' }
        });

        // Turning the challenge off must not also turn off the session requirement
        isError(res.json);
        expect(res.res.status).toBe(401);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'forbidden', message: 'Impersonation requires a dashboard session' }
        });
    });

    it('should reject a malformed code', async () => {
        flags.hasAdminCapabilities = true;

        const { account, apiKey } = await seeders.seedAccountEnvAndUser();
        envs.NANGO_ADMIN_UUID = account.uuid;

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'test' },
            token: apiKey.secret,
            body: { accountUUID: 'f8ca4c4e-8c5a-4502-93f9-cd89d7551362', loginReason: 'test', code: 'abc' }
        });

        isError(res.json);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: {
                code: 'invalid_body',
                errors: [{ code: 'invalid_format', message: 'Invalid string: must match pattern /^\\d{6}$/', path: ['code'] }]
            }
        });
    });
});

describe(`POST ${endpoint} with a dashboard session`, () => {
    let mfaFlagSpy: MockInstance<ReturnType<typeof featureFlags.getFlags>['isMFAEnabled']>;

    beforeAll(async () => {
        api = await runServer();
        mfaFlagSpy = vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);
    });
    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });
    afterEach(() => {
        flags.hasAdminCapabilities = false;
        envs.NANGO_IMPERSONATION_MFA_REQUIRED = true;
        mfaFlagSpy.mockResolvedValue(true);
    });

    async function enrollAndActivate(session: string) {
        const enrollment = await api.fetch('/api/v1/account/mfa/enroll', { method: 'POST', session });
        isSuccess(enrollment.json);
        const totp = OTPAuth.URI.parse(enrollment.json.data.otpauthUri) as OTPAuth.TOTP;
        const activation = await api.fetch('/api/v1/account/mfa/activate', { method: 'POST', session, body: { code: totp.generate() } });
        expect(activation.res.status).toBe(200);

        return totp;
    }

    /** Signs in first, because a user with an active factor would land in the pending MFA flow. */
    async function seedAdmin({ withFactor }: { withFactor: boolean }) {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        flags.hasAdminCapabilities = true;
        envs.NANGO_ADMIN_UUID = account.uuid;

        const session = await authenticateUser(api, user);
        if (!withFactor) {
            return { session, totp: null };
        }

        return { session, totp: await enrollAndActivate(session) };
    }

    /** Enrolls a factor, then signs in again through the MFA challenge so the session carries the verification. */
    async function seedAdminSignedInWithMfa() {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        flags.hasAdminCapabilities = true;
        envs.NANGO_ADMIN_UUID = account.uuid;

        const totp = await enrollAndActivate(await authenticateUser(api, user));

        const signin = await api.fetch('/api/v1/account/signin', { method: 'POST', body: { email: user.email, password: 'Password123!' } });
        isSuccess(signin.json);
        expect(signin.json).toEqual({ data: { mfaRequired: true } });
        const pendingSession = signin.res.headers.getSetCookie()[0]!.split(';')[0]!;

        const verification = await api.fetch('/api/v1/account/mfa/login/verify', {
            method: 'POST',
            session: pendingSession,
            body: { type: 'code', code: nextCode(totp) }
        });
        expect(verification.res.status).toBe(200);

        return { session: verification.res.headers.getSetCookie()[0]!.split(';')[0]!, totp };
    }

    async function seedTarget() {
        const { account } = await seeders.seedAccountEnvAndUser();
        return account.uuid;
    }

    /** The activation code is burned by replay protection, so later codes come from a future step. */
    function nextCode(totp: OTPAuth.TOTP, step = 1) {
        return totp.generate({ timestamp: Date.now() + step * 30_000 });
    }

    it('should impersonate with a valid code from the admin factor', async () => {
        const { session, totp } = await seedAdmin({ withFactor: true });
        const accountUUID = await seedTarget();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'support', code: nextCode(totp!) }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({ success: true });
    });

    it('should refuse when the admin has no factor enrolled', async () => {
        const { session } = await seedAdmin({ withFactor: false });
        const accountUUID = await seedTarget();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'support', code: '123456' }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual<typeof res.json>({ error: { code: 'mfa_not_enabled' } });
    });

    it('should refuse a wrong code', async () => {
        const { session } = await seedAdmin({ withFactor: true });
        const accountUUID = await seedTarget();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'support', code: '000000' }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual<typeof res.json>({ error: { code: 'invalid_mfa_code' } });
    });

    it('should ask for a code when the session has no recent verification', async () => {
        const { session } = await seedAdmin({ withFactor: true });
        const accountUUID = await seedTarget();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'support' }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual<typeof res.json>({ error: { code: 'mfa_code_required' } });
    });

    it('should impersonate without a code when the session just verified MFA at sign-in', async () => {
        const { session } = await seedAdminSignedInWithMfa();
        const accountUUID = await seedTarget();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'support' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual<typeof res.json>({ success: true });
    });

    it('should challenge even when the account MFA feature flag is off', async () => {
        const { session, totp } = await seedAdmin({ withFactor: true });
        const accountUUID = await seedTarget();
        mfaFlagSpy.mockResolvedValue(false);

        const refused = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'support', code: '000000' }
        });
        isError(refused.json);
        expect(refused.json).toStrictEqual<typeof refused.json>({ error: { code: 'invalid_mfa_code' } });

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'support', code: nextCode(totp!) }
        });
        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });

    it('should skip the challenge under breakglass', async () => {
        const { session } = await seedAdmin({ withFactor: false });
        const accountUUID = await seedTarget();
        envs.NANGO_IMPERSONATION_MFA_REQUIRED = false;

        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            session,
            body: { accountUUID, loginReason: 'incident' }
        });

        isSuccess(res.json);
        expect(res.res.status).toBe(200);
    });
});
