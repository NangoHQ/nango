import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { mfaService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { audit } from '../../../../audit.js';
import { isSuccess, runServer } from '../../../../utils/tests.js';

import type { AuditAction } from '@nangohq/audit';
import type * as NangoShared from '@nangohq/shared';
import type { DBUser } from '@nangohq/types';
import type { MockInstance } from 'vitest';

// The account is created by the signup route, so it is always on the free plan and not entitled to
// ingestion. Entitle the lookup instead; the gate itself is covered in utils/auditTrail.unit.test.ts.
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return { ...actual, getPlanSafe: () => Promise.resolve({ has_audit_trail_control_plane: true }) };
});

const signupRoute = '/api/v1/account/signup';
const signinRoute = '/api/v1/account/signin';
const verifyRoute = '/api/v1/account/mfa/login/verify';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

function eventWithAction(action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.action === action);
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

// The MFA login-verify flow is a dedicated middleware that resolves the acting user from the
// pending-login session (real signup + signin + MFA activation + DB reads), so it only makes sense
// against the live stack. The typed auditable() specs (enroll/enable/disable/recovery) are covered
// off-stack in ../../../../middleware/audit/mfa.middleware.unit.test.ts.
describe('MFA verify audit — pending-login session (private API)', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force the MFA feature on.
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
            accountId: user.account_id,
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
            accountId: user.account_id,
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
            accountId: user.account_id,
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'user', id: String(user.id), display: user.email }],
            metadata: { method: 'totp' }
        });
        expect(JSON.stringify(event)).not.toContain(badCode);
    });
});
