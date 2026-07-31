import { afterEach, describe, expect, it, vi } from 'vitest';

import * as featureFlags from '@nangohq/feature-flags';
import { flags } from '@nangohq/utils';

import { canRecordAuditTrail, canViewAuditTrail } from './auditTrail.js';

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
const entitled = { has_audit_trail_control_plane: true, has_audit_trail_ui: true };
const notEntitled = { has_audit_trail_control_plane: false, has_audit_trail_ui: false };

/**
 * `hasPlan` toggles FLAG_PLAN_ENABLED. `unleash: null` leaves the noop provider in place so the flag
 * resolves to its default, which is how a deployment without Unleash and an Unleash outage behave.
 */
function setup({ deployment, hasPlan, unleash }: { deployment: boolean; hasPlan: boolean; unleash: boolean | null }) {
    flags.hasAuditTrail = deployment;
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

    // The flag cannot be evaluated when no Unleash is configured (local, self-hosted) or it is down.
    // It then resolves to its default, which is `true` so audit events are never silently dropped.
    describe('when the flag cannot be evaluated', () => {
        it('records nothing when the deployment switch is off (self-hosted)', async () => {
            setup({ deployment: false, hasPlan: true, unleash: null });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
            await expect(canViewAuditTrail(UUID, entitled)).resolves.toBe(false);
        });

        it('records and shows everything when the switch is on and there are no plans (local dev)', async () => {
            setup({ deployment: true, hasPlan: false, unleash: null });

            await expect(canRecordAuditTrail(UUID, null)).resolves.toBe(true);
            await expect(canViewAuditTrail(UUID, null)).resolves.toBe(true);
        });

        it('keeps recording an entitled account rather than dropping its events', async () => {
            setup({ deployment: true, hasPlan: true, unleash: null });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(true);
            await expect(canRecordAuditTrail(UUID, notEntitled)).resolves.toBe(false);
        });
    });

    describe('with Unleash answering', () => {
        it('is off when the deployment switch is off, even if the flag says yes', async () => {
            setup({ deployment: false, hasPlan: true, unleash: true });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
            await expect(canViewAuditTrail(UUID, entitled)).resolves.toBe(false);
        });

        it('is off when the flag is off, even for an entitled account (kill switch)', async () => {
            setup({ deployment: true, hasPlan: true, unleash: false });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
            await expect(canViewAuditTrail(UUID, entitled)).resolves.toBe(false);
        });

        it('is off when the flag is on but the account is not entitled', async () => {
            setup({ deployment: true, hasPlan: true, unleash: true });

            await expect(canRecordAuditTrail(UUID, notEntitled)).resolves.toBe(false);
            await expect(canViewAuditTrail(UUID, notEntitled)).resolves.toBe(false);
        });

        it('is on only when the flag and the entitlement agree', async () => {
            setup({ deployment: true, hasPlan: true, unleash: true });

            await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(true);
            await expect(canViewAuditTrail(UUID, entitled)).resolves.toBe(true);
        });

        it('gates recording and visibility independently, so an account can be recorded without seeing it', async () => {
            setup({ deployment: true, hasPlan: true, unleash: true });
            const recordedOnly = { has_audit_trail_control_plane: true, has_audit_trail_ui: false };

            await expect(canRecordAuditTrail(UUID, recordedOnly)).resolves.toBe(true);
            await expect(canViewAuditTrail(UUID, recordedOnly)).resolves.toBe(false);
        });

        it('denies a missing plan rather than falling open', async () => {
            setup({ deployment: true, hasPlan: true, unleash: true });

            await expect(canRecordAuditTrail(UUID, null)).resolves.toBe(false);
            await expect(canViewAuditTrail(UUID, undefined)).resolves.toBe(false);
        });
    });
});
