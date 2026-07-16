import * as OTPAuth from 'otpauth';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../seeders/account.seeder.js';
import { seedUser } from '../seeders/user.seeder.js';
import * as encryptionManager from '../utils/encryption.manager.js';
import mfaService from './mfa.service.js';

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
