import * as OTPAuth from 'otpauth';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../seeders/account.seeder.js';
import { seedUser } from '../seeders/user.seeder.js';
import * as encryptionManager from '../utils/encryption.manager.js';
import mfaService from './mfa.service.js';

const STEP_MS = 30 * 1000;

describe('MFA service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('activates a TOTP factor, prevents replay, and consumes recovery codes once', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));

        const account = await createAccount();
        const user = await seedUser(account.id);
        const enrollment = (await mfaService.startEnrollment(user.id, user.email)).unwrap();
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;

        const activated = (await mfaService.activateEnrollment(user.id, totp.generate())).unwrap();
        expect(activated.recoveryCodes).toHaveLength(10);
        expect(await mfaService.hasActiveFactor(user.id)).toBe(true);

        vi.setSystemTime(new Date('2026-07-14T12:00:30Z'));
        const token = totp.generate();
        expect((await mfaService.verifyTotp(user.id, token)).unwrap()).toBe(true);
        expect((await mfaService.verifyTotp(user.id, token)).unwrap()).toBe(false);

        vi.setSystemTime(new Date('2026-07-14T12:01:00Z'));
        const previousStepToken = totp.generate();
        vi.setSystemTime(new Date('2026-07-14T12:01:30Z'));
        expect((await mfaService.verifyTotp(user.id, previousStepToken)).unwrap()).toBe(true);

        expect((await mfaService.consumeRecoveryCode(user.id, activated.recoveryCodes[0]!)).unwrap()).toBe(true);
        expect((await mfaService.consumeRecoveryCode(user.id, activated.recoveryCodes[0]!)).unwrap()).toBe(false);
    });

    it('replaces recovery codes and disables the factor', async () => {
        const account = await createAccount();
        const user = await seedUser(account.id);
        const enrollment = (await mfaService.startEnrollment(user.id, user.email)).unwrap();
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
        const activated = (await mfaService.activateEnrollment(user.id, totp.generate())).unwrap();

        const replacement = (await mfaService.regenerateRecoveryCodes(user.id)).unwrap();
        expect(replacement).toHaveLength(10);
        expect((await mfaService.consumeRecoveryCode(user.id, activated.recoveryCodes[0]!)).unwrap()).toBe(false);
        expect((await mfaService.consumeRecoveryCode(user.id, replacement[0]!)).unwrap()).toBe(true);

        (await mfaService.disable(user.id)).unwrap();
        expect(await mfaService.hasActiveFactor(user.id)).toBe(false);
    });

    it('tracks the clock offset of a device that runs ahead', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-12T12:00:00Z'));

        const account = await createAccount();
        const user = await seedUser(account.id);
        const enrollment = (await mfaService.startEnrollment(user.id, user.email)).unwrap();
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
        (await mfaService.activateEnrollment(user.id, totp.generate())).unwrap();
        expect((await mfaService.getActiveFactor(user.id))?.clock_offset_steps).toBe(0);

        // Marcin's case: the authenticator is 2 steps (60s) ahead of us
        const twoStepsAhead = totp.generate({ timestamp: Date.now() + 2 * STEP_MS });
        expect((await mfaService.verifyTotp(user.id, twoStepsAhead)).unwrap()).toBe(true);
        expect((await mfaService.getActiveFactor(user.id))?.clock_offset_steps).toBe(2);

        // now that we know the offset, a code 3 steps out is within the window centered on it
        const threeStepsAhead = totp.generate({ timestamp: Date.now() + 3 * STEP_MS });
        expect((await mfaService.verifyTotp(user.id, threeStepsAhead)).unwrap()).toBe(true);
        expect((await mfaService.getActiveFactor(user.id))?.clock_offset_steps).toBe(3);

        // and a fixed clock still works, rather than being locked out by the stale offset
        vi.setSystemTime(new Date('2026-08-12T12:02:00Z'));
        expect((await mfaService.verifyTotp(user.id, totp.generate())).unwrap()).toBe(true);
        expect((await mfaService.getActiveFactor(user.id))?.clock_offset_steps).toBe(0);
    });

    it('rejects a login code beyond the window when no offset is known', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-12T12:00:00Z'));

        const account = await createAccount();
        const user = await seedUser(account.id);
        const enrollment = (await mfaService.startEnrollment(user.id, user.email)).unwrap();
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
        (await mfaService.activateEnrollment(user.id, totp.generate())).unwrap();

        const fiveStepsAhead = totp.generate({ timestamp: Date.now() + 5 * STEP_MS });
        expect((await mfaService.verifyTotp(user.id, fiveStepsAhead)).unwrap()).toBe(false);
        expect((await mfaService.getActiveFactor(user.id))?.clock_offset_steps).toBe(0);
    });

    it('seeds the offset at activation so a badly unsynced device can still enroll', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-12T12:00:00Z'));

        const account = await createAccount();
        const user = await seedUser(account.id);
        const enrollment = (await mfaService.startEnrollment(user.id, user.email)).unwrap();
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;

        // 5 steps out would be refused at login, but activation is lenient enough to learn it
        (await mfaService.activateEnrollment(user.id, totp.generate({ timestamp: Date.now() + 5 * STEP_MS }))).unwrap();
        expect((await mfaService.getActiveFactor(user.id))?.clock_offset_steps).toBe(5);

        const sixStepsAhead = totp.generate({ timestamp: Date.now() + 6 * STEP_MS });
        expect((await mfaService.verifyTotp(user.id, sixStepsAhead)).unwrap()).toBe(true);
    });

    it('returns only the user ids with an active factor', async () => {
        const account = await createAccount();
        const enabledUser = await seedUser(account.id);
        const enrolledOnlyUser = await seedUser(account.id);
        const noFactorUser = await seedUser(account.id);

        const enrollment = (await mfaService.startEnrollment(enabledUser.id, enabledUser.email)).unwrap();
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
        (await mfaService.activateEnrollment(enabledUser.id, totp.generate())).unwrap();

        // enrolled but never activated, so not counted as enabled
        (await mfaService.startEnrollment(enrolledOnlyUser.id, enrolledOnlyUser.email)).unwrap();

        const enabledIds = await mfaService.getEnabledUserIds([enabledUser.id, enrolledOnlyUser.id, noFactorUser.id]);
        expect(enabledIds).toEqual(new Set([enabledUser.id]));

        expect(await mfaService.getEnabledUserIds([])).toEqual(new Set());
    });

    it('returns encryption setup failures instead of rejecting', async () => {
        const failure = new Error('invalid encryption key');
        vi.spyOn(encryptionManager, 'getEncryptionManager').mockImplementation(() => {
            throw failure;
        });

        const result = await mfaService.startEnrollment(1, 'user@example.com');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBe(failure);
        }
    });

    it('returns an explicit error when encryption is unavailable', async () => {
        vi.spyOn(encryptionManager, 'getEncryptionManager').mockReturnValue({
            shouldEncrypt: () => false
        } as ReturnType<typeof encryptionManager.getEncryptionManager>);

        const result = await mfaService.consumeRecoveryCode(1, 'recovery-code');

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toMatchObject({ code: 'encryption_unavailable' });
        }
    });
});
