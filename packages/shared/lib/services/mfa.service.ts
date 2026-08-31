import crypto from 'node:crypto';

import * as OTPAuth from 'otpauth';

import db from '@nangohq/database';
import { Err, metrics, Ok } from '@nangohq/utils';

import { getEncryptionManager } from '../utils/encryption.manager.js';

import type { DBMFAFactor, DBMFARecoveryCode, Result } from '@nangohq/types';
import type { Knex } from 'knex';

const FACTORS_TABLE = 'user_mfa_factors';
const RECOVERY_CODES_TABLE = 'user_mfa_recovery_codes';
const RECOVERY_CODE_COUNT = 10;
const TOTP_ISSUER = 'Nango';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_WINDOW = 2;
const TOTP_ENROLLMENT_WINDOW = 5;
const MAX_CLOCK_OFFSET_STEPS = 10;
/**
 * Only ever used to explain a rejection we have already decided on. A code that lands here is still
 * refused, we just get to say it was drift rather than a wrong code.
 */
const DRIFT_DIAGNOSTIC_WINDOW = 20;

export type MFAErrorCode = 'encryption_unavailable' | 'already_enabled' | 'enrollment_not_found' | 'invalid_code' | 'not_enabled';

export type MFAVerifyContext = 'login' | 'step_up' | 'activation' | 'recovery_codes_regenerate' | 'disable' | 'impersonation' | 'unknown';

export type MFAVerifyMethod = 'totp' | 'recovery_code';

export type MFAVerifyFailureReason =
    | 'not_enrolled'
    | 'malformed_code'
    | 'clock_drift'
    | 'code_reuse'
    | 'concurrent_use'
    | 'unknown_recovery_code'
    | 'wrong_code'
    | 'challenge_expired'
    | 'user_not_eligible';

type TokenCheck =
    | { ok: true; counter: bigint; measuredOffsetSteps: number; boundedOffsetSteps: number }
    | { ok: false; reason: Extract<MFAVerifyFailureReason, 'malformed_code' | 'clock_drift' | 'wrong_code'> };

export interface MFAVerifyOptions {
    trx?: Knex;
    context?: MFAVerifyContext;
}

export function recordMFAVerifySuccess({ context, method, driftSteps = 0 }: { context: MFAVerifyContext; method: MFAVerifyMethod; driftSteps?: number }): void {
    metrics.increment(metrics.Types.MFA_VERIFY_SUCCESS, 1, { context, method, drift: Math.abs(driftSteps) });
}

export function recordMFALoginRefused({ method }: { method: MFAVerifyMethod }): void {
    metrics.increment(metrics.Types.MFA_LOGIN_REFUSED, 1, { method, reason: 'user_not_eligible' });
}

export function recordMFAVerifyFailure({
    context,
    method,
    reason
}: {
    context: MFAVerifyContext;
    method: MFAVerifyMethod;
    reason: MFAVerifyFailureReason;
}): void {
    metrics.increment(metrics.Types.MFA_VERIFY_FAILURE, 1, { context, method, reason });
}

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
                            clock_offset_steps: 0,
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
                    last_accepted_counter: null,
                    clock_offset_steps: 0
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

                const verified = this.verifyToken(factor, token, TOTP_ENROLLMENT_WINDOW);
                if (!verified.ok) {
                    recordMFAVerifyFailure({ context: 'activation', method: 'totp', reason: verified.reason });
                    throw new MFAError('invalid_code');
                }
                recordMFAVerifySuccess({ context: 'activation', method: 'totp', driftSteps: verified.measuredOffsetSteps });

                const recoveryCodes = this.createRecoveryCodes();
                await trx<DBMFAFactor>(FACTORS_TABLE)
                    .where({ id: factor.id })
                    .update({
                        enabled_at: trx.fn.now() as unknown as Date,
                        last_accepted_counter: verified.counter.toString(),
                        clock_offset_steps: verified.boundedOffsetSteps,
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

    public async getActiveFactor(userId: number, trx: Knex = db.knex): Promise<DBMFAFactor | null> {
        const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').first();
        return factor || null;
    }

    public async hasActiveFactor(userId: number, trx?: Knex): Promise<boolean> {
        return Boolean(await this.getActiveFactor(userId, trx));
    }

    public async getEnabledUserIds(userIds: number[]): Promise<Set<number>> {
        if (userIds.length === 0) {
            return new Set();
        }

        const rows = await db.knex<DBMFAFactor>(FACTORS_TABLE).select('user_id').whereIn('user_id', userIds).whereNotNull('enabled_at');
        return new Set(rows.map((row) => row.user_id));
    }

    /**
     * Pass `trx` to consume the factor in the caller's transaction, so rolling that back
     * un-burns the code rather than leaving it spent on an action that never happened.
     */
    public async verifyTotp(userId: number, token: string, { trx: parentTrx, context = 'unknown' }: MFAVerifyOptions = {}): Promise<Result<boolean>> {
        try {
            const verified = await this.inTransaction(parentTrx, async (trx) => {
                const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').forUpdate().first();
                if (!factor) {
                    recordMFAVerifyFailure({ context, method: 'totp', reason: 'not_enrolled' });
                    return false;
                }

                const verified = this.verifyToken(factor, token, TOTP_WINDOW);
                if (!verified.ok) {
                    recordMFAVerifyFailure({ context, method: 'totp', reason: verified.reason });
                    return false;
                }
                if (factor.last_accepted_counter !== null && verified.counter <= BigInt(factor.last_accepted_counter)) {
                    recordMFAVerifyFailure({ context, method: 'totp', reason: 'code_reuse' });
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
                    .update({
                        last_accepted_counter: verified.counter.toString(),
                        clock_offset_steps: verified.boundedOffsetSteps,
                        updated_at: trx.fn.now() as unknown as Date
                    });

                if (updated !== 1) {
                    recordMFAVerifyFailure({ context, method: 'totp', reason: 'concurrent_use' });
                    return false;
                }

                recordMFAVerifySuccess({ context, method: 'totp', driftSteps: verified.measuredOffsetSteps });
                return true;
            });
            return Ok(verified);
        } catch (err) {
            return Err(err);
        }
    }

    /** See {@link verifyTotp} for the options. */
    public async consumeRecoveryCode(userId: number, code: string, { trx: parentTrx, context = 'unknown' }: MFAVerifyOptions = {}): Promise<Result<boolean>> {
        try {
            const codeHash = this.hashRecoveryCode(code);
            const consumed = await this.inTransaction(parentTrx, async (trx) => {
                const factor = await trx<DBMFAFactor>(FACTORS_TABLE).where({ user_id: userId }).whereNotNull('enabled_at').forUpdate().first();
                if (!factor) {
                    recordMFAVerifyFailure({ context, method: 'recovery_code', reason: 'not_enrolled' });
                    return false;
                }

                const updated = await trx<DBMFARecoveryCode>(RECOVERY_CODES_TABLE)
                    .where({ user_id: userId, code_hash: codeHash })
                    .whereNull('consumed_at')
                    .update({ consumed_at: trx.fn.now() as unknown as Date });

                if (updated !== 1) {
                    recordMFAVerifyFailure({ context, method: 'recovery_code', reason: 'unknown_recovery_code' });
                    return false;
                }

                recordMFAVerifySuccess({ context, method: 'recovery_code' });
                return true;
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
            period: TOTP_PERIOD_SECONDS,
            secret: 'secret' in input ? input.secret : new OTPAuth.Secret({ size: 20 })
        });
    }

    private verifyToken(factor: DBMFAFactor, token: string, window: number): TokenCheck {
        if (!/^\d{6}$/.test(token)) {
            return { ok: false, reason: 'malformed_code' };
        }

        const encryptionManager = getEncryptionManager();
        if (!encryptionManager.shouldEncrypt()) {
            throw new MFAError('encryption_unavailable');
        }

        const secret = encryptionManager.decryptSync(factor.encrypted_secret, factor.iv, factor.auth_tag);
        const totp = this.createTotp({ secret: OTPAuth.Secret.fromBase32(secret) });
        const timestamp = Date.now();

        // Check around our own clock as well as around the offset we last saw on this device.
        const centers = new Set([0, factor.clock_offset_steps]);
        for (const center of centers) {
            const delta = totp.validate({ token, timestamp: timestamp + center * TOTP_PERIOD_SECONDS * 1000, window });
            if (delta === null) {
                continue;
            }

            const measuredOffsetSteps = center + delta;
            // Only the bounded value is persisted, so a device reporting a wildly wrong clock cannot drag
            // the accept window arbitrarily far on the next attempt.
            return {
                ok: true,
                counter: BigInt(totp.counter({ timestamp }) + measuredOffsetSteps),
                measuredOffsetSteps,
                boundedOffsetSteps: Math.max(-MAX_CLOCK_OFFSET_STEPS, Math.min(MAX_CLOCK_OFFSET_STEPS, measuredOffsetSteps))
            };
        }

        const driftingDelta = totp.validate({ token, timestamp, window: DRIFT_DIAGNOSTIC_WINDOW });
        return { ok: false, reason: driftingDelta === null ? 'wrong_code' : 'clock_drift' };
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

    private async inTransaction<T>(parentTrx: Knex | undefined, handler: (trx: Knex) => Promise<T>): Promise<T> {
        return parentTrx ? await handler(parentTrx) : await db.knex.transaction(handler);
    }

    private async acquireUserLock(trx: Knex, userId: number): Promise<void> {
        await trx.raw('SELECT pg_advisory_xact_lock(?)', [userId]);
    }
}

export default new MFAService();
