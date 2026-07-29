import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { mfaService, seeders, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { audit } from '../../../../audit.js';
import { authenticateUser, isSuccess, runServer } from '../../../../utils/tests.js';

import type { AuditAction } from '@nangohq/audit';
import type { DBUser } from '@nangohq/types';
import type { MockInstance } from 'vitest';

const mfaRoute = '/api/v1/account/mfa';
const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const verifyRoute = '/api/v1/account/mfa/login/verify';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

function eventWithAction(action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.action === action);
}

async function enrollAndActivate(session: string): Promise<OTPAuth.TOTP> {
    const enrollment = await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session });
    isSuccess(enrollment.json);
    const totp = OTPAuth.URI.parse(enrollment.json.data.otpauthUri) as OTPAuth.TOTP;
    const activation = await api.fetch(`${mfaRoute}/activate`, { method: 'POST', session, body: { code: totp.generate() } });
    expect(activation.res.status).toBe(200);
    return totp;
}

// Signs up a verified user with an active MFA factor (enrolled directly through the service, so no HTTP
// audit event is produced), then signs them in to reach the pending-MFA-login state. Returns the pending
// session cookie plus the user and TOTP so the caller can drive /mfa/login/verify.
async function startPendingMfaLogin(): Promise<{ user: DBUser; totp: OTPAuth.TOTP; recoveryCodes: string[]; pendingSession: string }> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!?';
    const signupRes = await api.fetch(signupRoute, { method: 'POST', body: { email, name: 'Foobar', password, foundUs: 'tests' } as any });
    expect(signupRes.res.status).toBe(200);

    const created = await userService.getUserByEmail(email);
    expect(created).toBeTruthy();
    await userService.verifyUserEmail(created!.id);

    const enrollment = (await mfaService.startEnrollment(created!.id, email)).unwrap();
    const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
    const { recoveryCodes } = (await mfaService.activateEnrollment(created!.id, totp.generate())).unwrap();

    const signinRes = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
    expect(signinRes.res.status).toBe(200);
    const pendingSession = signinRes.res.headers.getSetCookie()[0]!.split(';')[0]!;

    const user = await userService.getUserById(created!.id, true);
    expect(user).toBeTruthy();
    return { user: user!, totp, recoveryCodes, pendingSession };
}

describe('MFA audit (private API)', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force both the MFA feature and the audit trail on.
        vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('records an audit event when a user enrolls in MFA', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        await vi.waitFor(() => {
            expect(eventWithAction('enrolled')).toBeDefined();
        });
        expect(eventWithAction('enrolled')).toMatchObject({
            resource: 'mfa',
            action: 'enrolled',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }]
        });
    });

    it('records an audit event when a user activates MFA', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const enrollment = await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session });
        isSuccess(enrollment.json);
        const totp = OTPAuth.URI.parse(enrollment.json.data.otpauthUri) as OTPAuth.TOTP;

        const res = await api.fetch(`${mfaRoute}/activate`, { method: 'POST', session, body: { code: totp.generate() } });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        await vi.waitFor(() => {
            expect(eventWithAction('enabled')).toBeDefined();
        });
        expect(eventWithAction('enabled')).toMatchObject({
            resource: 'mfa',
            action: 'enabled',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }]
        });
    });

    it('records an audit event when a user regenerates recovery codes', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const totp = await enrollAndActivate(session);

        const code = totp.generate({ timestamp: Date.now() + 30_000 });
        const res = await api.fetch(`${mfaRoute}/recovery-codes`, { method: 'POST', session, body: { code } });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        await vi.waitFor(() => {
            expect(eventWithAction('recovery_regenerated')).toBeDefined();
        });
        const event = eventWithAction('recovery_regenerated');
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'recovery_regenerated',
            outcome: 'success',
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }]
        });
        // The submitted TOTP code and the returned recovery codes must never reach the audit record.
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain(code);
        for (const recoveryCode of res.json.data.recoveryCodes) {
            expect(serialized).not.toContain(recoveryCode);
        }
    });

    it('records an audit event when a user disables MFA', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        const totp = await enrollAndActivate(session);

        const code = totp.generate({ timestamp: Date.now() + 30_000 });
        const res = await api.fetch(mfaRoute, { method: 'DELETE', session, body: { code } });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        await vi.waitFor(() => {
            expect(eventWithAction('disabled')).toBeDefined();
        });
        const event = eventWithAction('disabled');
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'disabled',
            outcome: 'success',
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }]
        });
        expect(JSON.stringify(event)).not.toContain(code);
    });

    it('records a failure outcome for a rejected activation and never persists the submitted code', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);
        await api.fetch(`${mfaRoute}/enroll`, { method: 'POST', session });

        const badCode = '000000';
        const res = await api.fetch(`${mfaRoute}/activate`, { method: 'POST', session, body: { code: badCode } });
        expect(res.res.status).toBe(400);

        await vi.waitFor(() => {
            expect(eventWithAction('enabled')).toBeDefined();
        });
        const event = eventWithAction('enabled');
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'enabled',
            outcome: 'failure',
            actor: { type: 'user', id: String(user.id), display: user.email }
        });
        expect(JSON.stringify(event)).not.toContain(badCode);
    });

    it('records a verified event on a successful MFA login challenge, attributing the pending user', async () => {
        const { user, totp, pendingSession } = await startPendingMfaLogin();

        const code = totp.generate({ timestamp: Date.now() + 30_000 });
        const res = await api.fetch(verifyRoute, { method: 'POST', session: pendingSession, body: { type: 'code', code } });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        await vi.waitFor(() => {
            expect(eventWithAction('verified')).toBeDefined();
        });
        const event = eventWithAction('verified');
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'verified',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { method: 'totp' }
        });
        // The submitted code must never reach the audit record.
        expect(JSON.stringify(event)).not.toContain(code);
    });

    it('records a verified event when a recovery code is consumed, without persisting the recovery code', async () => {
        const { user, recoveryCodes, pendingSession } = await startPendingMfaLogin();

        const recoveryCode = recoveryCodes[0]!;
        const res = await api.fetch(verifyRoute, { method: 'POST', session: pendingSession, body: { type: 'recoveryCode', recoveryCode } });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        await vi.waitFor(() => {
            expect(eventWithAction('verified')).toBeDefined();
        });
        const event = eventWithAction('verified');
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'verified',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { method: 'recovery_code' }
        });
        // The submitted recovery code must never reach the audit record.
        expect(JSON.stringify(event)).not.toContain(recoveryCode);
    });

    it('records a failure outcome for a rejected MFA login challenge, still attributing the pending user', async () => {
        const { user, pendingSession } = await startPendingMfaLogin();

        const badCode = '000000';
        const res = await api.fetch(verifyRoute, { method: 'POST', session: pendingSession, body: { type: 'code', code: badCode } });
        expect(res.res.status).toBe(400);

        await vi.waitFor(() => {
            expect(eventWithAction('verified')).toBeDefined();
        });
        const event = eventWithAction('verified');
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'verified',
            outcome: 'failure',
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { method: 'totp' }
        });
        expect(JSON.stringify(event)).not.toContain(badCode);
    });
});
