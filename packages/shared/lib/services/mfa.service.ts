import crypto from 'node:crypto';

import * as OTPAuth from 'otpauth';

import db from '@nangohq/database';

import { getEncryptionManager } from '../utils/encryption.manager.js';

import type { DBMFAFactor, DBMFARecoveryCode } from '@nangohq/types';
import type { Knex } from 'knex';

const FACTORS_TABLE = 'user_mfa_factors';
const RECOVERY_CODES_TABLE = 'user_mfa_recovery_codes';
const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Nango';
const TOTP_WINDOW = 1;

class MFAService {
    public async startEnrollment(userId: number, email: string): Promise<{ otpauthUri: string }> {
        const encryptionManager = getEncryptionManager();
        if (!encryptionManager.shouldEncrypt()) {
            throw new Error('MFA requires an encryption key');
        }

        const totp = this.createTotp(email);
        const [encryptedSecret, iv, authTag] = encryptionManager.encryptSync(totp.secret.base32);

        await db.knex.transaction(async (trx) => {
            const existing = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).first();
            if (existing?.enabled_at) {
                throw new Error('MFA is already enabled');
            }

            if (existing) {
                await trx<DBMFAFactor>(FACTORS_TABLE)
                    .where({ id: existing.id })
                    .update({
                        encrypted_secret: encryptedSecret,
                        iv,
                        auth_tag: authTag,
                        last_used_counter: null,
                        updated_at: trx.fn.now() as unknown as Date
                    });
                return;
            }

            await trx<DBMFAFactor>(FACTORS_TABLE).insert({
                user_id: userId,
                type: 'totp',
                encrypted_secret: encryptedSecret,
                iv,
                auth_tag: authTag,
                enabled_at: null,
                last_used_counter: null
            });
        });

        return { otpauthUri: totp.toString() };
    }

    public async activateEnrollment(userId: number, token: string): Promise<{ recoveryCodes: string[] }> {
        return db.knex.transaction(async (trx) => {
            const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNull('enabled_at').first();
            if (!factor) {
                throw new Error('No pending MFA enrollment found');
            }

            const counter = this.getVerifiedCounter(factor, token);
            if (counter === null) {
                throw new Error('Invalid MFA code');
            }

            const recoveryCodes = this.createRecoveryCodes();
            await trx<DBMFAFactor>(FACTORS_TABLE)
                .where({ id: factor.id })
                .update({
                    enabled_at: trx.fn.now() as unknown as Date,
                    last_used_counter: counter,
                    updated_at: trx.fn.now() as unknown as Date
                });
            await this.replaceRecoveryCodes(trx, userId, recoveryCodes);

            return { recoveryCodes };
        });
    }

    public async getActiveFactor(userId: number): Promise<DBMFAFactor | null> {
        const factor = await db.knex<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').first();
        return factor || null;
    }

    public async hasActiveFactor(userId: number): Promise<boolean> {
        return Boolean(await this.getActiveFactor(userId));
    }

    public async verifyTotp(userId: number, token: string): Promise<boolean> {
        return db.knex.transaction(async (trx) => {
            const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').forUpdate().first();
            if (!factor) {
                return false;
            }

            const counter = this.getVerifiedCounter(factor, token);
            if (counter === null || (factor.last_used_counter !== null && counter <= factor.last_used_counter)) {
                return false;
            }

            const updated = await trx<DBMFAFactor>(FACTORS_TABLE)
                .where({ id: factor.id })
                .modify((queryBuilder) => {
                    if (factor.last_used_counter === null) {
                        queryBuilder.whereNull('last_used_counter');
                    } else {
                        queryBuilder.where('last_used_counter', factor.last_used_counter);
                    }
                })
                .update({ last_used_counter: counter, updated_at: trx.fn.now() as unknown as Date });

            return updated === 1;
        });
    }

    public async consumeRecoveryCode(userId: number, code: string): Promise<boolean> {
        const codeHash = this.hashRecoveryCode(code);
        const updated = await db
            .knex<DBMFARecoveryCode>(RECOVERY_CODES_TABLE)
            .where({ user_id: userId, code_hash: codeHash })
            .whereNull('used_at')
            .update({ used_at: db.knex.fn.now() as unknown as Date });

        return updated === 1;
    }

    public async regenerateRecoveryCodes(userId: number): Promise<string[]> {
        return db.knex.transaction(async (trx) => {
            const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').first();
            if (!factor) {
                throw new Error('MFA is not enabled');
            }

            const recoveryCodes = this.createRecoveryCodes();
            await this.replaceRecoveryCodes(trx, userId, recoveryCodes);
            return recoveryCodes;
        });
    }

    public async disable(userId: number): Promise<void> {
        await db.knex.transaction(async (trx) => {
            await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE).where({ user_id: userId }).delete();
            await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).delete();
        });
    }

    private createTotp(email: string, secret = new OTPAuth.Secret({ size: 20 })): OTPAuth.TOTP {
        return new OTPAuth.TOTP({
            issuer: TOTP_ISSUER,
            label: email,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret
        });
    }

    private getVerifiedCounter(factor: DBMFAFactor, token: string): number | null {
        if (!/^\d{6}$/.test(token)) {
            return null;
        }

        const encryptionManager = getEncryptionManager();
        if (!encryptionManager.shouldEncrypt()) {
            throw new Error('MFA requires an encryption key');
        }

        const secret = encryptionManager.decryptSync(factor.encrypted_secret, factor.iv, factor.auth_tag);
        const totp = this.createTotp('', OTPAuth.Secret.fromBase32(secret));
        const delta = totp.validate({ token, window: TOTP_WINDOW });
        return delta === null ? null : totp.counter() + delta;
    }

    private createRecoveryCodes(): string[] {
        return Array.from({ length: RECOVERY_CODE_COUNT }, () => crypto.randomBytes(16).toString('base64url'));
    }

    private hashRecoveryCode(code: string): string {
        const encryptionManager = getEncryptionManager();
        if (!encryptionManager.shouldEncrypt()) {
            throw new Error('MFA requires an encryption key');
        }

        return crypto.createHmac('sha256', encryptionManager.getKey()).update(code).digest('base64');
    }

    private async replaceRecoveryCodes(trx: Knex, userId: number, recoveryCodes: string[]): Promise<void> {
        await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE).where({ user_id: userId }).delete();
        await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE).insert(recoveryCodes.map((code) => ({ user_id: userId, code_hash: this.hashRecoveryCode(code) })));
    }
}

export default new MFAService();
