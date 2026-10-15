import { createHash, randomUUID } from 'node:crypto';

import db from '@nangohq/database';

import type {
    AdvertisingClickIds,
    AdvertisingConsentChoice,
    DBUser,
    SignupAdvertisingContext,
    SignupAdvertisingPermission,
    SignupConsentReference
} from '@nangohq/types';
import type { Knex } from 'knex';

export interface StoredAdvertisingConsent {
    id: string;
    owner_hash: string;
    choice: AdvertisingConsentChoice;
    revision: number;
    click_context: SignupAdvertisingContext;
    observed_at: Date;
    invalidated_at: Date | null;
    expires_at: Date;
}

export const consentOwnerHash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Follow configured CMP defaults without inventing an explicit user action. */
export function advertisingPermissionBasis(choice: AdvertisingConsentChoice): 'explicit' | 'regional_default' | null {
    // Missing signals from older records must not become a grant under the new policy.
    if (choice.marketing !== true || choice.globalPrivacyControl !== false) return null;
    if (choice.method === 'explicit') return 'explicit';
    if (
        choice.method === 'implied' &&
        choice.regulations?.gdprApplies === false &&
        choice.regulations?.lgpdApplies === false &&
        typeof choice.regulations?.ccpaApplies === 'boolean'
    )
        return 'regional_default';
    return null;
}

export function permitsAdvertising(choice: AdvertisingConsentChoice): boolean {
    return advertisingPermissionBasis(choice) !== null;
}

export function sameAdvertisingChoice(a: AdvertisingConsentChoice, b: AdvertisingConsentChoice): boolean {
    return (
        a.method === b.method &&
        a.preferences === b.preferences &&
        a.statistics === b.statistics &&
        a.marketing === b.marketing &&
        a.globalPrivacyControl === b.globalPrivacyControl &&
        a.regulations?.gdprApplies === b.regulations?.gdprApplies &&
        a.regulations?.lgpdApplies === b.regulations?.lgpdApplies &&
        a.regulations?.ccpaApplies === b.regulations?.ccpaApplies
    );
}

export function nextAdvertisingConsent(
    previous: StoredAdvertisingConsent,
    input: { choice: AdvertisingConsentChoice; expectedRevision: number | null; clickIds: AdvertisingClickIds },
    now: Date
): { revision: number; context: SignupAdvertisingContext; changed: boolean } | null {
    const permits = permitsAdvertising(input.choice);
    if (permits && input.expectedRevision !== (previous.revision || null)) return null;
    const changed = previous.expires_at <= now || previous.invalidated_at !== null || !sameAdvertisingChoice(previous.choice, input.choice);
    const context: SignupAdvertisingContext = permits && !changed ? { ...previous.click_context } : {};
    if (permits) {
        const ids = input.clickIds;
        const observedAt = now.toISOString();
        if (ids.gclid || ids.gbraid || ids.wbraid) {
            const googleIds: Pick<AdvertisingClickIds, 'gclid' | 'gbraid' | 'wbraid'> = {};
            if (ids.gclid) googleIds.gclid = ids.gclid;
            if (ids.gbraid) googleIds.gbraid = ids.gbraid;
            if (ids.wbraid) googleIds.wbraid = ids.wbraid;
            if (JSON.stringify(context.google?.ids) !== JSON.stringify(googleIds)) context.google = { ids: googleIds, observedAt, source: 'landing_query' };
        }
        if (ids.fbclid && ids.fbclid !== context.meta?.fbclid) context.meta = { fbclid: ids.fbclid, observedAt, source: 'landing_query' };
        if (ids.msclkid && ids.msclkid !== context.microsoft?.msclkid) context.microsoft = { msclkid: ids.msclkid, observedAt, source: 'landing_query' };
    }
    return { revision: previous.revision + (changed ? 1 : 0), context, changed };
}

export async function readAdvertisingConsent(ownerHash: string): Promise<StoredAdvertisingConsent | undefined> {
    return db.knex<StoredAdvertisingConsent>('advertising_consents').where({ owner_hash: ownerHash }).first().timeout(1000, { cancel: true });
}

/** Writes are serialized in SQL. A stale tab must never undo a later withdrawal. */
export async function recordAdvertisingConsent(input: {
    ownerHash: string;
    choice: AdvertisingConsentChoice;
    expectedRevision: number | null;
    clickIds: AdvertisingClickIds;
    lifetimeMs: number;
}): Promise<{ revision: number } | null> {
    return db.knex.transaction(async (trx) => {
        const now = new Date();
        // Seed then lock, including concurrent first requests for the same owner.
        await trx('advertising_consents')
            .insert({
                id: randomUUID(),
                owner_hash: input.ownerHash,
                choice: {
                    preferences: false,
                    statistics: false,
                    marketing: false,
                    method: null,
                    globalPrivacyControl: false,
                    regulations: { gdprApplies: null, lgpdApplies: null, ccpaApplies: null }
                },
                revision: 0,
                click_context: {},
                observed_at: now,
                invalidated_at: null,
                expires_at: now
            })
            .onConflict('owner_hash')
            .ignore();
        const previous = await trx<StoredAdvertisingConsent>('advertising_consents').where({ owner_hash: input.ownerHash }).forUpdate().first();
        if (!previous) throw new Error('Consent record unavailable');
        const next = nextAdvertisingConsent(previous, input, now);
        if (!next) return null;
        const { revision, context, changed } = next;
        await trx('advertising_consents')
            .where({ id: previous.id })
            .update({
                choice: input.choice,
                revision,
                click_context: context,
                observed_at: now,
                invalidated_at: null,
                expires_at: changed ? new Date(now.getTime() + input.lifetimeMs) : previous.expires_at,
                updated_at: now
            });
        // Remove stored ad IDs immediately when consent changes, including old queued signup snapshots.
        if (changed) await trx('signup_advertising_consents').where({ consent_id: previous.id }).update({ click_context: {} });
        return { revision };
    });
}

/** Called inside account creation. Its savepoint lets optional storage fail without breaking signup. */
export async function bindSignupAdvertisingConsent(trx: Knex.Transaction, accountId: number, reference: SignupConsentReference): Promise<void> {
    await trx.transaction(async (savepoint) => {
        const consent = await savepoint<StoredAdvertisingConsent>('advertising_consents')
            .where({ id: reference.id })
            .forShare()
            .first()
            .timeout(1000, { cancel: true });
        if (!consent || consent.invalidated_at || consent.revision !== reference.revision || consent.expires_at <= new Date()) return;
        await savepoint('signup_advertising_consents')
            .insert({
                account_id: accountId,
                consent_id: consent.id,
                consent_revision: consent.revision,
                click_context: permitsAdvertising(consent.choice) ? consent.click_context : {},
                signup_id: reference.signupId,
                expires_at: consent.expires_at
            })
            .timeout(1000, { cancel: true });
    });
}

/** Bind only the creator from the request which inserted this account's signup record. */
export async function completeSignupAdvertisingConsent(accountId: number, userId: number, reference: SignupConsentReference | undefined): Promise<void> {
    if (!reference || process.env['ADVERTISING_CONSENT_ENABLED'] !== 'true') return;
    try {
        const user = await db.knex<DBUser>('_nango_users').where({ id: userId, account_id: accountId }).first().timeout(1000, { cancel: true });
        if (!user) return;
        await db
            .knex('signup_advertising_consents')
            .where({ account_id: accountId, signup_id: reference.signupId })
            .whereNull('creator_user_id')
            .update({ creator_user_id: user.id, creator_is_internal: user.email.toLowerCase().endsWith('@nango.dev') })
            .timeout(1000, { cancel: true });
    } catch {
        /* A missing creator remains ineligible; optional tracking must not block signup. */
    }
}

/** Read immediately before dispatch, never cache this result in a queue. Null means do not send. */
export async function getSignupAdvertisingPermission(accountId: number): Promise<SignupAdvertisingPermission | null> {
    if (process.env['ADVERTISING_CONSENT_ENABLED'] !== 'true') return null;
    try {
        const result = await db
            .knex('signup_advertising_consents as signup')
            .join('advertising_consents as consent', 'consent.id', 'signup.consent_id')
            .join('_nango_users as creator', 'creator.id', 'signup.creator_user_id')
            .where('signup.account_id', accountId)
            .where('creator.account_id', accountId)
            .where('creator.email_verified', true)
            .where('creator.suspended', false)
            .where('signup.creator_is_internal', false)
            .whereRaw('lower(??) NOT LIKE ?', ['creator.email', '%@nango.dev'])
            .whereNull('consent.invalidated_at')
            .whereRaw('?? = ??', ['signup.consent_revision', 'consent.revision'])
            .where('signup.expires_at', '>', new Date())
            .where('consent.expires_at', '>', new Date())
            .select('consent.choice', 'consent.revision', 'consent.observed_at', 'signup.click_context', 'signup.created_at')
            .first<{ choice: AdvertisingConsentChoice; revision: number; observed_at: Date; click_context: SignupAdvertisingContext; created_at: Date }>()
            .timeout(1000, { cancel: true });
        if (!result) return null;
        const basis = advertisingPermissionBasis(result.choice);
        if (!basis) return null;
        return {
            context: result.click_context,
            signupAt: result.created_at,
            // Current Cookiebot policy maps Marketing to these three states. Retain the evaluated
            // choice and revision so adapters can audit the mapping rather than invent a grant.
            consent: {
                choice: result.choice,
                revision: result.revision,
                observedAt: result.observed_at,
                source: 'cookiebot',
                mappingVersion: 'cookiebot-regional-marketing-v2',
                basis,
                adStorage: 'granted',
                adUserData: 'granted',
                adPersonalization: 'granted'
            }
        };
    } catch {
        return null;
    }
}

/** Explicit maintenance operation, not run automatically on rollback or server startup. */
export async function deleteExpiredAdvertisingConsents(before: Date): Promise<void> {
    if (!Number.isFinite(before.getTime()) || before > new Date()) throw new Error('Cleanup cutoff must be in the past');
    await db.knex.transaction(async (trx) => {
        await trx('signup_advertising_consents').where('expires_at', '<', before).delete();
        await trx('advertising_consents').where('expires_at', '<', before).delete();
    });
}

/** Explicit rollback operation. Retains the choices but prevents replay if reporting is re-enabled. */
export async function invalidateAdvertisingPermissions(): Promise<void> {
    await db.knex.transaction(async (trx) => {
        const now = new Date();
        await trx('advertising_consents').update({ invalidated_at: now, click_context: {}, updated_at: now });
        await trx('signup_advertising_consents').update({ expires_at: now, click_context: {} });
    });
}
