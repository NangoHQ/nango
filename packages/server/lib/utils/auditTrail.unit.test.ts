import { afterEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { flags } from '@nangohq/utils';

import { canAccessAuditTrail, canRecordAuditTrail, canViewAuditTrail } from './auditTrail.js';

import type * as NangoUtils from '@nangohq/utils';

// `flagHasPlan` is a const export, so it can only be varied per test through the module mock.
const planFlag = vi.hoisted(() => ({ enabled: true }));
vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');
    return {
        ...actual,
        get flagHasPlan() {
            return planFlag.enabled;
        }
    };
});

const UUID = 'acc-uuid';
const customer = { session: {} } as Parameters<typeof canViewAuditTrail>[0];
const operator = { session: { impersonatedBy: { accountId: 1, accountName: 'Nango', actorId: 7 } } } as Parameters<typeof canViewAuditTrail>[0];
const entitled = { has_audit_trail_control_plane: true, has_audit_trail_access: true };
const notEntitled = { has_audit_trail_control_plane: false, has_audit_trail_access: false };

/** `unleash: null` leaves the noop provider in place, so the flag resolves to its default. */
function setup({ optIn, hasPlan, unleash }: { optIn: boolean; hasPlan: boolean; unleash: boolean | null }) {
    flags.hasAuditTrail = optIn;
    planFlag.enabled = hasPlan;
    if (unleash != null) {
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(unleash);
    }
}

describe('audit trail entitlement', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        planFlag.enabled = true;
        vi.restoreAllMocks();
    });

    describe('the deployment opt-in', () => {
        it('turns everything on without a flag provider or a plan (local dev)', async () => {
            setup({ optIn: true, hasPlan: false, unleash: null });

            await expect(canRecordAuditTrail(UUID, null)).resolves.toBe(true);
            await expect(canAccessAuditTrail(UUID, null)).resolves.toBe(true);
        });

        it('cannot weaken the rollout flag or the entitlement where plans exist', async () => {
            setup({ optIn: true, hasPlan: true, unleash: false });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
            await expect(canAccessAuditTrail(UUID, entitled)).resolves.toBe(false);
        });
    });

    describe('without the opt-in, so the rollout flag and the plan decide', () => {
        it('is off when the flag cannot be evaluated, so the rollout only advances explicitly', async () => {
            setup({ optIn: false, hasPlan: true, unleash: null });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
            await expect(canAccessAuditTrail(UUID, entitled)).resolves.toBe(false);
        });

        it('is off when the flag is off, even for an entitled account (kill switch)', async () => {
            setup({ optIn: false, hasPlan: true, unleash: false });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
            await expect(canAccessAuditTrail(UUID, entitled)).resolves.toBe(false);
        });

        it('honours the plan once the flag is on, so a full rollout still excludes unentitled accounts', async () => {
            setup({ optIn: false, hasPlan: true, unleash: true });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(true);
            await expect(canAccessAuditTrail(UUID, entitled)).resolves.toBe(true);
            await expect(canRecordAuditTrail(UUID, notEntitled)).resolves.toBe(false);
            await expect(canAccessAuditTrail(UUID, notEntitled)).resolves.toBe(false);
        });

        it('gates recording and visibility independently, so an account can be recorded without seeing it', async () => {
            setup({ optIn: false, hasPlan: true, unleash: true });
            const recordedOnly = { has_audit_trail_control_plane: true, has_audit_trail_access: false };

            await expect(canRecordAuditTrail(UUID, recordedOnly)).resolves.toBe(true);
            await expect(canAccessAuditTrail(UUID, recordedOnly)).resolves.toBe(false);
        });

        it('denies a missing plan rather than falling open', async () => {
            setup({ optIn: false, hasPlan: true, unleash: true });

            await expect(canRecordAuditTrail(UUID, null)).resolves.toBe(false);
            await expect(canAccessAuditTrail(UUID, undefined)).resolves.toBe(false);
        });

        // Self-hosted has no plans layer, so it stays off even once the interim flag is retired.
        it('stays off where there are no plans to read an entitlement from', async () => {
            setup({ optIn: false, hasPlan: false, unleash: true });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
            await expect(canAccessAuditTrail(UUID, entitled)).resolves.toBe(false);
        });
    });

    describe('what a session can view', () => {
        it('holds the customer to the access entitlement', async () => {
            setup({ optIn: false, hasPlan: true, unleash: true });

            await expect(canViewAuditTrail(customer, UUID, { has_audit_trail_control_plane: true, has_audit_trail_access: false })).resolves.toBe(false);
            await expect(canViewAuditTrail(customer, UUID, entitled)).resolves.toBe(true);
        });

        it('lets an impersonating operator past the access entitlement', async () => {
            setup({ optIn: false, hasPlan: true, unleash: true });

            await expect(canViewAuditTrail(operator, UUID, { has_audit_trail_control_plane: true, has_audit_trail_access: false })).resolves.toBe(true);
        });

        it('still hides it from the operator when the account is not recorded, so an empty page cannot mislead', async () => {
            setup({ optIn: false, hasPlan: true, unleash: true });

            await expect(canViewAuditTrail(operator, UUID, { has_audit_trail_control_plane: false, has_audit_trail_access: true })).resolves.toBe(false);
            await expect(canViewAuditTrail(operator, UUID, notEntitled)).resolves.toBe(false);
        });

        it('cannot be reached by an operator once the rollout flag is off', async () => {
            setup({ optIn: false, hasPlan: true, unleash: false });

            await expect(canViewAuditTrail(operator, UUID, entitled)).resolves.toBe(false);
        });
    });
});
