import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { mfaService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { audit } from '../audit.js';
import { isSuccess, runServer } from '../utils/tests.js';
import { resetPasswordSecret } from '../utils/utils.js';

import type { AuditAction } from '@nangohq/audit';
import type { DBUser } from '@nangohq/types';
import type { MockInstance } from 'vitest';

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const logoutRoute = '/api/v1/account/logout';
const resetPasswordRoute = '/api/v1/account/reset-password';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

// A test that signs in before acting records an app_auth/login first, so select the event under test
// by its action rather than by position.
function authEvent(action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.action === action);
}

async function signupVerifiedUser(): Promise<{ email: string; password: string; user: DBUser }> {
    const email = `${nanoid()}@example.com`;
    const password = 'aZ1-foobar!?';

    const signupRes = await api.fetch(signupRoute, {
        method: 'POST',
        body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
    });
    expect(signupRes.res.status).toBe(200);

    const user = await userService.getUserByEmail(email);
    await userService.verifyUserEmail(user!.id);

    return { email, password, user: user! };
}

async function enrollMfaUser(): Promise<{ email: string; password: string; user: DBUser; totp: OTPAuth.TOTP }> {
    const { email, password, user } = await signupVerifiedUser();
    const enrollment = (await mfaService.startEnrollment(user.id, email)).unwrap();
    const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
    (await mfaService.activateEnrollment(user.id, totp.generate())).unwrap();
    return { email, password, user, totp };
}

async function signin(email: string, password: string): Promise<string> {
    const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie()[0];
    return cookie!.split(';')[0]!;
}

describe('auth audit middleware (private API)', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force the audit trail on. MFA is forced on
        // too so an enrolled user's sign-in takes the pending-MFA path.
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
        vi.spyOn(featureFlags.getFlags(), 'isMFAEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('records app_auth/login on a successful sign-in', async () => {
        const { email, password, user } = await signupVerifiedUser();
        // Signing up already emits an audit event; only the sign-in under test should be asserted.
        auditSpy.mockClear();

        const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
        expect(res.status).toBe(200);

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'login',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { mfaRequired: false }
        });
    });

    it('records app_auth/login with metadata.mfaRequired true when the sign-in starts an MFA challenge', async () => {
        const { email, password, user } = await enrollMfaUser();
        auditSpy.mockClear();

        const { res, json } = await api.fetch(signinRoute, { method: 'POST', body: { email, password } });
        expect(res.status).toBe(200);
        // The password step returns mfaRequired and stashes pendingMfaLogin; the login event is recorded here.
        expect(json).toEqual({ data: { mfaRequired: true } });

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'login',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            metadata: { mfaRequired: true }
        });
    });

    it('records app_auth/login with outcome denied on a wrong-password attempt', async () => {
        const { email, user } = await signupVerifiedUser();
        auditSpy.mockClear();

        const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email, password: 'aZ1-WRONGpass!?' } });
        expect(res.status).toBe(401);

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        // The rejected attempt is still attributed to the account the attempted email maps to.
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'login',
            outcome: 'denied',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email }
        });
    });

    it('does not record a login for an email that maps to no account', async () => {
        const { res } = await api.fetch(signinRoute, { method: 'POST', body: { email: `${nanoid()}@example.com`, password: 'aZ1-foobar!?' } });
        expect(res.status).toBe(401);

        // Give the finish hook a chance to run; an unknown email must not produce an audit event.
        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('records app_auth/signup on a successful sign-up', async () => {
        const email = `${nanoid()}@example.com`;
        const password = 'aZ1-foobar!?';

        const res = await api.fetch(signupRoute, {
            method: 'POST',
            body: { email, name: 'Foobar', password, foundUs: 'tests' } as any
        });
        expect(res.res.status).toBe(200);

        const user = await userService.getUserByEmail(email);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'signup',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user!.id), display: user!.email },
            targets: [{ type: 'user', id: String(user!.id), display: user!.email }]
        });
    });

    it('records app_auth/logout on a successful logout', async () => {
        const { email, password, user } = await signupVerifiedUser();
        const session = await signin(email, password);

        // logout replies 200 with an empty body; api.fetch's res.json() would throw, so use a raw fetch.
        const res = await fetch(`${api.url}${logoutRoute}`, { method: 'POST', headers: { Cookie: session } });
        expect(res.status).toBe(200);

        await vi.waitFor(() => {
            expect(authEvent('logout')).toBeDefined();
        });
        expect(authEvent('logout')).toMatchObject({
            resource: 'app_auth',
            action: 'logout',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }]
        });
    });

    it('records app_auth/password_reset on a successful reset', async () => {
        const { email, user } = await signupVerifiedUser();
        auditSpy.mockClear();

        const token = jwt.sign({ user: email }, resetPasswordSecret(), { expiresIn: '10m' });
        await userService.editUserPassword({ id: user.id, reset_password_token: token, hashed_password: user.hashed_password });

        const { res, json } = await api.fetch(resetPasswordRoute, {
            method: 'PUT',
            body: { token, password: 'aZ1-newpass!?' }
        });
        expect(res.status).toBe(200);
        isSuccess(json);

        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'app_auth',
            action: 'password_reset',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }]
        });
    });
});
