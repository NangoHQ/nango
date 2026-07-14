import * as OTPAuth from 'otpauth';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { multipleMigrations } from '@nangohq/database';

import { createAccount } from '../seeders/account.seeder.js';
import { seedUser } from '../seeders/user.seeder.js';
import mfaService from './mfa.service.js';

describe('MFA service', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('activates a TOTP factor, prevents replay, and consumes recovery codes once', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T12:00:00Z'));

        const account = await createAccount();
        const user = await seedUser(account.id);
        const enrollment = await mfaService.startEnrollment(user.id, user.email);
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;

        const activated = await mfaService.activateEnrollment(user.id, totp.generate());
        expect(activated.recoveryCodes).toHaveLength(10);
        expect(await mfaService.hasActiveFactor(user.id)).toBe(true);

        vi.setSystemTime(new Date('2026-07-14T12:00:30Z'));
        const token = totp.generate();
        expect(await mfaService.verifyTotp(user.id, token)).toBe(true);
        expect(await mfaService.verifyTotp(user.id, token)).toBe(false);

        expect(await mfaService.consumeRecoveryCode(user.id, activated.recoveryCodes[0]!)).toBe(true);
        expect(await mfaService.consumeRecoveryCode(user.id, activated.recoveryCodes[0]!)).toBe(false);
    });

    it('replaces recovery codes and disables the factor', async () => {
        const account = await createAccount();
        const user = await seedUser(account.id);
        const enrollment = await mfaService.startEnrollment(user.id, user.email);
        const totp = OTPAuth.URI.parse(enrollment.otpauthUri) as OTPAuth.TOTP;
        const activated = await mfaService.activateEnrollment(user.id, totp.generate());

        const replacement = await mfaService.regenerateRecoveryCodes(user.id);
        expect(replacement).toHaveLength(10);
        expect(await mfaService.consumeRecoveryCode(user.id, activated.recoveryCodes[0]!)).toBe(false);

        await mfaService.disable(user.id);
        expect(await mfaService.hasActiveFactor(user.id)).toBe(false);
    });
});
