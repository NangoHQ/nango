import { afterEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';

import { envs } from '../env.js';
import {
    advertisingPermissionBasis,
    consentOwnerHash,
    getSignupAdvertisingPermission,
    nextAdvertisingConsent,
    permitsAdvertising
} from './advertisingConsent.js';

import type { StoredAdvertisingConsent } from './advertisingConsent.js';

const grant = {
    preferences: false,
    statistics: true,
    marketing: true,
    method: 'explicit' as const,
    globalPrivacyControl: false,
    regulations: { gdprApplies: true, lgpdApplies: false, ccpaApplies: false }
};
const now = new Date('2026-10-14T12:00:00Z');
const originalEnabled = envs.ADVERTISING_CONSENT_ENABLED;
const previous: StoredAdvertisingConsent = {
    id: 'context',
    owner_hash: 'hash',
    choice: grant,
    revision: 3,
    click_context: { google: { ids: { gclid: 'first' }, observedAt: now.toISOString(), source: 'landing_query' } },
    observed_at: now,
    invalidated_at: null,
    expires_at: new Date(now.getTime() + 60000)
};

afterEach(() => {
    envs.ADVERTISING_CONSENT_ENABLED = originalEnabled;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('advertising consent policy', () => {
    it('preserves independent ChatGPT, X and Reddit touches without refreshing repeated IDs', () => {
        const clickIds = { oppref: 'opaque+/=', twclid: 'x-first', rdt_cid: 'reddit-first' };
        const first = nextAdvertisingConsent(previous, { choice: grant, expectedRevision: 3, clickIds }, now);
        if (!first) throw new Error('Missing granted context');
        expect(first.context).toMatchObject({
            chatgpt: { oppref: clickIds.oppref, observedAt: now.toISOString() },
            x: { twclid: clickIds.twclid, observedAt: now.toISOString() },
            reddit: { rdt_cid: clickIds.rdt_cid, observedAt: now.toISOString() }
        });
        const later = new Date(now.getTime() + 1000);
        const stored = { ...previous, click_context: first.context };
        expect(nextAdvertisingConsent(stored, { choice: grant, expectedRevision: 3, clickIds }, later)?.context).toEqual(first.context);
        const next = nextAdvertisingConsent(stored, { choice: grant, expectedRevision: 3, clickIds: { twclid: 'x-new' } }, later);
        if (!next) throw new Error('Missing returning context');
        expect(next.context.x).toEqual({ twclid: 'x-new', observedAt: later.toISOString(), source: 'landing_query' });
        expect(next.context.chatgpt).toEqual(first.context.chatgpt);
        expect(next.context.reddit).toEqual(first.context.reddit);
        expect(nextAdvertisingConsent(stored, { choice: { ...grant, marketing: false }, expectedRevision: 3, clickIds }, later)?.context).toEqual({});
    });
    it('requires explicit opt-in in an opt-in region and never grants missing choices', () => {
        expect(permitsAdvertising(grant)).toBe(true);
        expect(permitsAdvertising({ ...grant, method: 'implied' })).toBe(false);
        expect(permitsAdvertising({ ...grant, method: null })).toBe(false);
        expect(permitsAdvertising({ ...grant, marketing: false })).toBe(false);
    });

    it('allows the resolved CMP regional default without inventing explicit consent', () => {
        for (const ccpaApplies of [false, true]) {
            const choice = { ...grant, method: 'implied' as const, regulations: { gdprApplies: false, lgpdApplies: false, ccpaApplies } };
            expect(advertisingPermissionBasis(choice)).toBe('regional_default');
            expect(choice.method).toBe('implied');
            expect(permitsAdvertising({ ...choice, marketing: false })).toBe(false);
            expect(permitsAdvertising({ ...choice, globalPrivacyControl: true })).toBe(false);
            expect(permitsAdvertising({ ...choice, regulations: { ...choice.regulations, gdprApplies: null } })).toBe(false);
            expect(permitsAdvertising({ ...choice, regulations: { ...choice.regulations, lgpdApplies: true } })).toBe(false);
        }
        expect(permitsAdvertising({ ...grant, globalPrivacyControl: true })).toBe(false);
    });

    it('invalidates a regional grant on GPC or movement to an opt-in region', () => {
        const choice = { ...grant, method: 'implied' as const, regulations: { gdprApplies: false, lgpdApplies: false, ccpaApplies: true } };
        const regional = { ...previous, choice };
        for (const denied of [
            { ...choice, globalPrivacyControl: true },
            { ...choice, regulations: { ...choice.regulations, gdprApplies: true } }
        ]) {
            expect(nextAdvertisingConsent(regional, { choice: denied, expectedRevision: 1, clickIds: { gclid: 'not-allowed' } }, now)).toEqual({
                revision: 4,
                changed: true,
                context: {}
            });
        }
        expect(nextAdvertisingConsent(regional, { choice, expectedRevision: 2, clickIds: {} }, now)).toBeNull();
    });

    it('rejects a stale grant after another tab changes consent', () => {
        expect(nextAdvertisingConsent(previous, { choice: grant, expectedRevision: 2, clickIds: {} }, now)).toBeNull();
    });

    it('allows withdrawal from a stale tab and discards all ad IDs', () => {
        expect(
            nextAdvertisingConsent(
                previous,
                {
                    choice: { ...grant, marketing: false },
                    expectedRevision: 1,
                    clickIds: { gclid: 'must-not-store' }
                },
                now
            )
        ).toEqual({ revision: 4, changed: true, context: {} });
    });

    it('does not invalidate the signup on an unchanged returning visit', () => {
        expect(nextAdvertisingConsent(previous, { choice: grant, expectedRevision: 3, clickIds: {} }, now)).toEqual({
            revision: 3,
            changed: false,
            context: previous.click_context
        });
    });

    it('captures a subsequent ad visit without changing the choice', () => {
        expect(nextAdvertisingConsent(previous, { choice: grant, expectedRevision: 3, clickIds: { gclid: 'second' } }, now)?.context.google?.ids).toEqual({
            gclid: 'second'
        });
    });

    it('replaces Google touch atomically while preserving independent Meta attribution', () => {
        const mixed = {
            ...previous,
            click_context: { ...previous.click_context, meta: { fbclid: 'meta-first', observedAt: now.toISOString(), source: 'landing_query' as const } }
        };
        const later = new Date(now.getTime() + 1000);
        const next = nextAdvertisingConsent(mixed, { choice: grant, expectedRevision: 3, clickIds: { wbraid: 'new-braid' } }, later);
        expect(next?.context.google).toEqual({ ids: { wbraid: 'new-braid' }, observedAt: later.toISOString(), source: 'landing_query' });
        expect(next?.context.meta).toEqual(mixed.click_context.meta);
        if (!next) throw new Error('Expected granted context');
        const reverse = nextAdvertisingConsent(
            { ...previous, click_context: next.context },
            { choice: grant, expectedRevision: 3, clickIds: { gclid: 'new-click', gbraid: 'same-touch' } },
            later
        );
        expect(reverse?.context.google?.ids).toEqual({ gclid: 'new-click', gbraid: 'same-touch' });
    });

    it('does not refresh click observation time when an unchanged URL is reported again', () => {
        expect(
            nextAdvertisingConsent(previous, { choice: grant, expectedRevision: 3, clickIds: { gclid: 'first' } }, new Date(now.getTime() + 1000))?.context
        ).toEqual(previous.click_context);
    });

    it('rejects an unchanged expired grant even with a current revision and new ad IDs', () => {
        const expired = { ...previous, expires_at: now };
        expect(nextAdvertisingConsent(expired, { choice: grant, expectedRevision: 3, clickIds: {} }, now)).toBeNull();
        expect(nextAdvertisingConsent(expired, { choice: grant, expectedRevision: 3, clickIds: { gclid: 'new-ad' } }, now)).toBeNull();
    });

    it('accepts withdrawal after expiry and a subsequent changed choice without old IDs', () => {
        const expired = { ...previous, expires_at: now };
        expect(nextAdvertisingConsent(expired, { choice: { ...grant, marketing: false }, expectedRevision: 1, clickIds: {} }, now)).toEqual({
            revision: 4,
            changed: true,
            context: {}
        });
        const withdrawn = { ...previous, choice: { ...grant, marketing: false }, revision: 4, click_context: {} };
        expect(nextAdvertisingConsent(withdrawn, { choice: grant, expectedRevision: 4, clickIds: {} }, now)?.revision).toBe(5);
    });

    it('starts a new revision after rollback invalidation without reusing ad IDs', () => {
        const invalidated = { ...previous, invalidated_at: now };
        expect(nextAdvertisingConsent(invalidated, { choice: grant, expectedRevision: 3, clickIds: {} }, now)).toEqual({
            revision: 4,
            changed: true,
            context: {}
        });
    });

    it('stores only a one-way hash of the ownership token', () => {
        expect(consentOwnerHash('test-token')).toMatch(/^[a-f0-9]{64}$/);
        expect(consentOwnerHash('test-token')).not.toEqual('test-token');
    });

    it('does not query or allow reporting when disabled', async () => {
        vi.stubEnv('ADVERTISING_CONSENT_ENABLED', 'false');
        envs.ADVERTISING_CONSENT_ENABLED = false;
        expect(await getSignupAdvertisingPermission(42)).toBeNull();
    });

    it('fails closed when storage is unavailable', async () => {
        // Use the parsed flag even when the raw value is a different accepted spelling.
        vi.stubEnv('ADVERTISING_CONSENT_ENABLED', 'yes');
        envs.ADVERTISING_CONSENT_ENABLED = true;
        // A missing table/connection is not evidence of permission. No connection is attempted here.
        const acquire = vi.spyOn(db.knex.client, 'acquireConnection').mockRejectedValueOnce(new Error('offline'));
        expect(await getSignupAdvertisingPermission(42)).toBeNull();
        expect(acquire).toHaveBeenCalledOnce();
    });
});
