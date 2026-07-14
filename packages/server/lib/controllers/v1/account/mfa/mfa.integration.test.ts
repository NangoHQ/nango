import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { seeders } from '@nangohq/shared';

import { authenticateUser, isError, isSuccess, runServer } from '../../../../utils/tests.js';

vi.mock('@nangohq/feature-flags', () => ({
    getFlags: () => ({ isMFAEnabled: () => Promise.resolve(true) })
}));

const mfaRoute = '/api/v1/account/mfa';

let api: Awaited<ReturnType<typeof runServer>>;

describe('MFA settings', () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('enrolls, activates, regenerates recovery codes, and disables MFA', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const cookie = await authenticateUser(api, user);

        const enrollment = await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session: cookie });
        expect(enrollment.res.status).toBe(200);
        isSuccess(enrollment.json);
        const totp = OTPAuth.URI.parse(enrollment.json.data.otpauthUri) as OTPAuth.TOTP;

        const activation = await api.fetch(`${mfaRoute}/activate`, {
            method: 'POST',
            session: cookie,
            body: { code: totp.generate() }
        });
        expect(activation.res.status).toBe(200);
        isSuccess(activation.json);
        expect(activation.json.data.recoveryCodes).toHaveLength(10);

        const status = await api.fetch(mfaRoute, { method: 'GET', session: cookie });
        expect(status.res.status).toBe(200);
        isSuccess(status.json);
        expect(status.json.data.enabled).toBe(true);

        const nextCode = totp.generate({ timestamp: Date.now() + 30_000 });
        const recoveryCodes = await api.fetch(`${mfaRoute}/recovery-codes`, {
            method: 'POST',
            session: cookie,
            body: { code: nextCode }
        });
        expect(recoveryCodes.res.status).toBe(200);
        isSuccess(recoveryCodes.json);
        expect(recoveryCodes.json.data.recoveryCodes).toHaveLength(10);
    });

    it('requires a valid code to activate MFA', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const cookie = await authenticateUser(api, user);

        const enrollment = await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session: cookie });
        expect(enrollment.res.status).toBe(200);

        const activation = await api.fetch(`${mfaRoute}/activate`, { method: 'POST', session: cookie, body: { code: '000000' } });
        expect(activation.res.status).toBe(400);
        isError(activation.json);
        expect(activation.json.error.code).toBe('invalid_mfa_code');
    });

    it('disables MFA with a valid code', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const cookie = await authenticateUser(api, user);

        const enrollment = await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session: cookie });
        isSuccess(enrollment.json);
        const totp = OTPAuth.URI.parse(enrollment.json.data.otpauthUri) as OTPAuth.TOTP;
        await api.fetch(`${mfaRoute}/activate`, { method: 'POST', session: cookie, body: { code: totp.generate() } });

        const code = totp.generate({ timestamp: Date.now() + 30_000 });
        const disable = await api.fetch(mfaRoute, { method: 'DELETE', session: cookie, body: { code } });
        expect(disable.res.status).toBe(200);
        isSuccess(disable.json);
        expect(disable.json.success).toBe(true);
    });
});
