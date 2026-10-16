import { randomUUID } from 'node:crypto';

import db from '@nangohq/database';
import { getSignupAdvertisingPermission } from '@nangohq/shared';

import type { SignupAdvertisingPermission } from '@nangohq/types';

export type Platform = 'meta' | 'google' | 'chatgpt' | 'x' | 'reddit';
export type DeliveryResult =
    | { status: 'accepted'; receiptId?: string }
    | { status: 'submitted'; receiptId: string }
    | { status: 'duplicate'; receiptId: string }
    | { status: 'retry_ingestion'; reason: 'processing_delay' }
    | { status: 'retry'; reason: 'network' | 'rate_limit' | 'server_error' | 'unconfirmed' }
    | { status: 'failed'; reason: 'rejected' | 'configuration' };

export interface ConversionAdapter {
    platform: Platform;
    /** Stable destination identity, excluding secrets. Changing it never replays old outcomes. */
    destination: string;
    startAt: Date;
    connect?: () => Promise<void>;
    checkReceipt?: (receiptId: string) => Promise<DeliveryResult>;
    prepare: (accountId: number, permission: SignupAdvertisingPermission) => Record<string, unknown> | null;
    send: (payload: unknown) => Promise<DeliveryResult>;
}

interface Delivery {
    account_id: number;
    platform: Platform;
    destination: string;
    status: 'pending' | 'submitted' | 'accepted' | 'duplicate' | 'failed' | 'skipped' | 'expired' | 'unconfirmed';
    attempts: number;
    signup_at: Date;
    expires_at: Date;
    next_attempt_at: Date;
    lease_id: string | null;
    lease_until: Date | null;
    receipt_id: string | null;
    submitted_at: Date | null;
}

const table = 'signup_ad_conversions';
const maxAgeMs = 24 * 60 * 60 * 1000;
const leaseMs = 60_000;
const maxAttempts = 8;
export const conversionEventId = (accountId: number): string => `nango:account_create:${accountId}`;

/** Restrict browser-reported context to production app URLs. This does not attest its authenticity. */
export function isProductionSignup(permission: SignupAdvertisingPermission, now = new Date()): boolean {
    const { sourceUrl, userAgent } = permission.context.browser ?? {};
    const age = now.getTime() - permission.signupAt.getTime();
    return (
        Number.isFinite(age) &&
        age >= 0 &&
        age < maxAgeMs &&
        (sourceUrl === 'https://app.nango.dev/signup' || sourceUrl === 'https://app.nango.dev/signin') &&
        typeof userAgent === 'string' &&
        userAgent.length > 0 &&
        userAgent.length <= 1024 &&
        /^[\x20-\x7e]+$/.test(userAgent)
    );
}

/** Scan committed signup bindings, so an enqueue failure cannot interrupt signup or lose the outcome. */
export async function enqueueConversions(adapter: ConversionAdapter, now = new Date()): Promise<void> {
    if (!Number.isFinite(adapter.startAt.getTime())) throw new Error('Invalid conversion start time');
    const rows = await db
        .knex('signup_advertising_consents as signup')
        .join('_nango_accounts as account', 'account.id', 'signup.account_id')
        .where('account.created_at', '>=', new Date(Math.max(adapter.startAt.getTime(), now.getTime() - maxAgeMs)))
        .where('account.created_at', '<=', now)
        .where('signup.expires_at', '>', now)
        .whereRaw('?? \\? ?', ['signup.click_context', adapter.platform])
        .whereNotExists(
            db
                .knex(table)
                .select(db.knex.raw('1'))
                .whereRaw('?? = ??', [`${table}.account_id`, 'signup.account_id'])
                .where('platform', adapter.platform)
        )
        .orderBy('account.created_at')
        .limit(100)
        .select('signup.account_id', 'account.created_at', 'signup.expires_at')
        .timeout(2000, { cancel: true });
    if (rows.length === 0) return;
    await db
        .knex(table)
        .insert(
            rows.map((row: { account_id: number; created_at: Date; expires_at: Date }) => ({
                account_id: row.account_id,
                platform: adapter.platform,
                destination: adapter.destination,
                signup_at: row.created_at,
                expires_at: new Date(Math.min(row.expires_at.getTime(), row.created_at.getTime() + maxAgeMs)),
                next_attempt_at: now
            }))
        )
        .onConflict(['account_id', 'platform'])
        .ignore();
}

async function claim(platform: Platform, now: Date): Promise<Delivery | undefined> {
    return db.knex.transaction(async (trx) => {
        const row = await trx<Delivery>(table)
            .where({ platform })
            .whereIn('status', ['pending', 'submitted'])
            .where('next_attempt_at', '<=', now)
            .where((query) => {
                query.whereNull('lease_until').orWhere('lease_until', '<=', now);
            })
            .orderBy('next_attempt_at')
            .forUpdate()
            .skipLocked()
            .first();
        if (!row) return undefined;
        const lease = { lease_id: randomUUID(), lease_until: new Date(now.getTime() + leaseMs) };
        await trx(table).where({ account_id: row.account_id, platform }).update(lease);
        return { ...row, ...lease };
    });
}

async function finish(row: Delivery, values: Record<string, unknown>): Promise<void> {
    await db
        .knex(table)
        .where({ account_id: row.account_id, platform: row.platform, lease_id: row.lease_id })
        .update({ ...values, lease_id: null, lease_until: null, updated_at: new Date() });
}

export async function deliverNextConversion(
    adapter: ConversionAdapter,
    enabled: () => boolean,
    permissionLookup = getSignupAdvertisingPermission
): Promise<boolean> {
    if (!enabled()) return false;
    const row = await claim(adapter.platform, new Date());
    if (!row) return false;
    if (row.status === 'submitted' && (!row.submitted_at || row.submitted_at.getTime() + maxAgeMs <= Date.now())) {
        await finish(row, { status: 'unconfirmed', reason: 'receipt_deadline' });
        return true;
    }
    if (row.status === 'pending' && (row.expires_at <= new Date() || row.attempts >= maxAttempts)) {
        await finish(row, { status: row.attempts > 0 ? 'unconfirmed' : 'expired', reason: row.attempts >= maxAttempts ? 'attempt_limit' : 'age_limit' });
        return true;
    }
    if (row.destination !== adapter.destination || row.signup_at < adapter.startAt) {
        await finish(row, { status: 'skipped', reason: 'configuration_changed' });
        return true;
    }
    try {
        await adapter.connect?.();
    } catch {
        await finish(row, { next_attempt_at: new Date(Date.now() + 15 * 60_000), reason: 'authentication_unavailable' });
        return true;
    }
    if (row.status === 'submitted') {
        if (!row.receipt_id || !adapter.checkReceipt) {
            await finish(row, { status: 'failed', reason: 'missing_receipt_handler' });
            return true;
        }
        if (!enabled()) {
            await finish(row, { next_attempt_at: new Date(Date.now() + 60_000), reason: 'paused' });
            return true;
        }
        let receipt: DeliveryResult;
        try {
            receipt = await adapter.checkReceipt(row.receipt_id);
        } catch {
            receipt = { status: 'retry', reason: 'network' };
        }
        await finish(row, {
            status:
                receipt.status === 'retry_ingestion' ? 'pending' : receipt.status === 'retry' || receipt.status === 'submitted' ? 'submitted' : receipt.status,
            reason:
                receipt.status === 'duplicate' ? 'already_recorded' : receipt.status === 'accepted' || receipt.status === 'submitted' ? null : receipt.reason,
            ...(receipt.status === 'retry_ingestion' ? { receipt_id: null, submitted_at: null } : {}),
            next_attempt_at: new Date(Date.now() + (receipt.status === 'retry_ingestion' ? 3 * 60 * 60_000 : 30 * 60_000))
        });
        return true;
    }
    // Count/reserve the attempt before the final permission read. A crash cannot grant an extra send.
    const attempts = row.attempts + 1;
    await db.knex(table).where({ account_id: row.account_id, platform: row.platform, lease_id: row.lease_id }).update({ attempts });
    let permission: SignupAdvertisingPermission | null;
    try {
        permission = await permissionLookup(row.account_id);
    } catch {
        permission = null;
    }
    if (!permission) {
        // Verification may be pending. No payload is cached, and every later attempt reads again.
        await finish(row, { attempts: row.attempts, next_attempt_at: new Date(Date.now() + 15 * 60_000), reason: 'permission_unavailable' });
        return true;
    }
    if (!isProductionSignup(permission) || permission.signupAt.getTime() !== row.signup_at.getTime()) {
        await finish(row, { status: 'skipped', reason: 'ineligible_signup' });
        return true;
    }
    const payload = adapter.prepare(row.account_id, permission);
    if (!payload) {
        await finish(row, { status: 'skipped', reason: 'missing_context' });
        return true;
    }
    if (!enabled() || row.expires_at <= new Date() || !row.lease_until || row.lease_until <= new Date()) {
        await finish(row, { next_attempt_at: new Date(Date.now() + 60_000), reason: 'paused' });
        return true;
    }
    let result: DeliveryResult;
    try {
        result = await adapter.send(payload);
    } catch {
        // Never persist thrown errors, response bodies, tokens or click IDs.
        result = { status: 'retry', reason: 'network' };
    }
    const receiptId = result.status === 'accepted' || result.status === 'submitted' || result.status === 'duplicate' ? result.receiptId : undefined;
    await finish(row, {
        status: result.status === 'retry' || result.status === 'retry_ingestion' ? 'pending' : result.status,
        reason: result.status === 'duplicate' ? 'already_recorded' : result.status === 'accepted' || result.status === 'submitted' ? null : result.reason,
        submitted_at: result.status === 'submitted' ? new Date() : null,
        receipt_id: receiptId && /^[\x21-\x7e]{1,512}$/.test(receiptId) ? receiptId : null,
        next_attempt_at: new Date(Date.now() + (result.status === 'submitted' ? 30 * 60_000 : Math.min(60 * 60_000, 60_000 * 2 ** attempts)))
    });
    return true;
}
