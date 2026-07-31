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

/** `unleash: null` leaves the noop provider in place, so the flag resolves to its default. */
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

    it('is off when the deployment never opted in, even if the flag and the plan both say yes', async () => {
        setup({ deployment: false, hasPlan: true, unleash: true });

        await expect(canRecordAuditTrail(UUID, entitled)).resolves.toBe(false);
        await expect(canViewAuditTrail(UUID, entitled)).resolves.toBe(false);
    });

    it('is off when the flag cannot be evaluated, so the rollout only advances explicitly', async () => {
        setup({ deployment: true, hasPlan: true, unleash: null });

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

    it('is on only when the deployment, the flag and the entitlement all agree', async () => {
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

    it('skips the entitlement where there are no plans to read one from', async () => {
        setup({ deployment: true, hasPlan: false, unleash: true });

        await expect(canRecordAuditTrail(UUID, null)).resolves.toBe(true);
        await expect(canViewAuditTrail(UUID, null)).resolves.toBe(true);
    });
});
