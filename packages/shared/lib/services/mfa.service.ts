import crypto from 'node:crypto';

import * as OTPAuth from 'otpauth';

import db from '@nangohq/database';
import { Err, Ok } from '@nangohq/utils';

import { getEncryptionManager } from '../utils/encryption.manager.js';

import type { DBMFAFactor, DBMFARecoveryCode, Result } from '@nangohq/types';
import type { Knex } from 'knex';

const FACTORS_TABLE = 'user_mfa_factors';
const RECOVERY_CODES_TABLE = 'user_mfa_recovery_codes';
const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Nango';
const TOTP_WINDOW = 1;

export type MFAErrorCode = 'encryption_unavailable' | 'already_enabled' | 'enrollment_not_found' | 'invalid_code' | 'not_enabled';

export class MFAError extends Error {
    constructor(
        public readonly code: MFAErrorCode,
        cause?: unknown
    ) {
        super(code, cause === undefined ? undefined : { cause });
    }
}

class MFAService {
    public async startEnrollment(userId: number, email: string): Promise<Result<{ otpauthUri: string }>> {
        try {
            const encryptionManager = getEncryptionManager();
            if (!encryptionManager.shouldEncrypt()) {
                return Err(new MFAError('encryption_unavailable'));
            }

            const totp = this.createTotp({ email });
            const [encryptedSecret, iv, authTag] = encryptionManager.encryptSync(totp.secret.base32);
            await db.knex.transaction(async (trx) => {
                await this.acquireUserLock(trx, userId);
                const existing = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).forUpdate().first();
                if (existing?.enabled_at) {
                    throw new MFAError('already_enabled');
                }

                if (existing) {
                    await trx<DBMFAFactor>(FACTORS_TABLE)
                        .where({ id: existing.id })
                        .update({
                            encrypted_secret: encryptedSecret,
                            iv,
                            auth_tag: authTag,
                            last_accepted_counter: null,
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
                    last_accepted_counter: null
                });
            });
            return Ok({ otpauthUri: totp.toString() });
        } catch (err) {
            return Err(err);
        }
    }

    public async activateEnrollment(userId: number, token: string): Promise<Result<{ recoveryCodes: string[] }>> {
        try {
            const activated = await db.knex.transaction(async (trx) => {
                const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNull('enabled_at').forUpdate().first();
                if (!factor) {
                    throw new MFAError('enrollment_not_found');
                }

                const counter = this.getVerifiedCounter(factor, token);
                if (counter === null) {
                    throw new MFAError('invalid_code');
                }

                const recoveryCodes = this.createRecoveryCodes();
                await trx<DBMFAFactor>(FACTORS_TABLE)
                    .where({ id: factor.id })
                    .update({
                        enabled_at: trx.fn.now() as unknown as Date,
                        last_accepted_counter: counter.toString(),
                        updated_at: trx.fn.now() as unknown as Date
                    });
                await this.replaceRecoveryCodes(trx, userId, recoveryCodes);

                return { recoveryCodes };
            });
            return Ok(activated);
        } catch (err) {
            return Err(err);
        }
    }

    public async getActiveFactor(userId: number): Promise<DBMFAFactor | null> {
        const factor = await db.knex<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').first();
        return factor || null;
    }

    public async hasActiveFactor(userId: number): Promise<boolean> {
        return Boolean(await this.getActiveFactor(userId));
    }

    public async verifyTotp(userId: number, token: string): Promise<Result<boolean>> {
        try {
            const verified = await db.knex.transaction(async (trx) => {
                const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').forUpdate().first();
                if (!factor) {
                    return false;
                }

                const counter = this.getVerifiedCounter(factor, token);
                if (counter === null || (factor.last_accepted_counter !== null && counter <= BigInt(factor.last_accepted_counter))) {
                    return false;
                }

                const updated = await trx<DBMFAFactor>(FACTORS_TABLE)
                    .where({ id: factor.id })
                    .modify((queryBuilder) => {
                        if (factor.last_accepted_counter === null) {
                            queryBuilder.whereNull('last_accepted_counter');
                        } else {
                            queryBuilder.where('last_accepted_counter', factor.last_accepted_counter);
                        }
                    })
                    .update({ last_accepted_counter: counter.toString(), updated_at: trx.fn.now() as unknown as Date });

                return updated === 1;
            });
            return Ok(verified);
        } catch (err) {
            return Err(err);
        }
    }

    public async consumeRecoveryCode(userId: number, code: string): Promise<Result<boolean>> {
        try {
            const codeHash = this.hashRecoveryCode(code);
            const consumed = await db.knex.transaction(async (trx) => {
                const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').forUpdate().first();
                if (!factor) {
                    return false;
                }

                const updated = await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE)
                    .where({ user_id: userId, code_hash: codeHash })
                    .whereNull('consumed_at')
                    .update({ consumed_at: trx.fn.now() as unknown as Date });

                return updated === 1;
            });
            return Ok(consumed);
        } catch (err) {
            return Err(err);
        }
    }

    public async regenerateRecoveryCodes(userId: number): Promise<Result<string[]>> {
        try {
            const recoveryCodes = await db.knex.transaction(async (trx) => {
                const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').forUpdate().first();
                if (!factor) {
                    throw new MFAError('not_enabled');
                }

                const recoveryCodes = this.createRecoveryCodes();
                await this.replaceRecoveryCodes(trx, userId, recoveryCodes);
                return recoveryCodes;
            });
            return Ok(recoveryCodes);
        } catch (err) {
            return Err(err);
        }
    }

    public async disable(userId: number): Promise<Result<void>> {
        try {
            await db.knex.transaction(async (trx) => {
                await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).forUpdate().first();
                await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE).where({ user_id: userId }).delete();
                await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).delete();
            });
            return Ok();
        } catch (err) {
            return Err(err);
        }
    }

    private createTotp(input: { email: string } | { secret: OTPAuth.Secret }): OTPAuth.TOTP {
        return new OTPAuth.TOTP({
            issuer: TOTP_ISSUER,
            label: 'email' in input ? input.email : '',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: 'secret' in input ? input.secret : new OTPAuth.Secret({ size: 20 })
        });
    }

    private getVerifiedCounter(factor: DBMFAFactor, token: string): bigint | null {
        if (!/^\d{6}$/.test(token)) {
            return null;
        }

        const encryptionManager = getEncryptionManager();
        if (!encryptionManager.shouldEncrypt()) {
            throw new MFAError('encryption_unavailable');
        }

        const secret = encryptionManager.decryptSync(factor.encrypted_secret, factor.iv, factor.auth_tag);
        const totp = this.createTotp({ secret: OTPAuth.Secret.fromBase32(secret) });
        const timestamp = Date.now();
        const delta = totp.validate({ token, timestamp, window: TOTP_WINDOW });
        return delta === null ? null : BigInt(totp.counter({ timestamp }) + delta);
    }

    private createRecoveryCodes(): string[] {
        return Array.from({ length: RECOVERY_CODE_COUNT }, () => crypto.randomBytes(16).toString('base64url'));
    }

    private hashRecoveryCode(code: string): string {
        const encryptionManager = getEncryptionManager();
        if (!encryptionManager.shouldEncrypt()) {
            throw new MFAError('encryption_unavailable');
        }

        return crypto.createHmac('sha256', encryptionManager.getKey()).update(code).digest('base64');
    }

    private async replaceRecoveryCodes(trx: Knex, userId: number, recoveryCodes: string[]): Promise<void> {
        await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE).where({ user_id: userId }).delete();
        await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE).insert(recoveryCodes.map((code) => ({ user_id: userId, code_hash: this.hashRecoveryCode(code) })));
    }

    private async acquireUserLock(trx: Knex, userId: number): Promise<void> {
        await trx.raw('SELECT pg_advisory_xact_lock(?)', [userId]);
    }
}

export default new MFAService();
