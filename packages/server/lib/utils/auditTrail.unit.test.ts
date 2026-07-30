import { afterEach, describe, expect, it, vi } from 'vitest';

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

const entitled = { has_audit_trail_control_plane: true, has_audit_trail_ui: true };
const notEntitled = { has_audit_trail_control_plane: false, has_audit_trail_ui: false };

function setup({ hasAuditTrail, hasPlan }: { hasAuditTrail: boolean; hasPlan: boolean }) {
    flags.hasAuditTrail = hasAuditTrail;
    planFlag.enabled = hasPlan;
}

describe('audit trail entitlement', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        planFlag.enabled = true;
    });

    it('records nothing and shows nothing when the deployment flag is off, whatever the plan says', () => {
        setup({ hasAuditTrail: false, hasPlan: true });

        expect(canRecordAuditTrail(entitled)).toBe(false);
        expect(canViewAuditTrail(entitled)).toBe(false);
    });

    it('records and shows everything when there are no plans to read an entitlement from', () => {
        setup({ hasAuditTrail: true, hasPlan: false });

        expect(canRecordAuditTrail(null)).toBe(true);
        expect(canViewAuditTrail(null)).toBe(true);
    });

    it('follows the plan entitlement when plans exist', () => {
        setup({ hasAuditTrail: true, hasPlan: true });

        expect(canRecordAuditTrail(entitled)).toBe(true);
        expect(canViewAuditTrail(entitled)).toBe(true);
        expect(canRecordAuditTrail(notEntitled)).toBe(false);
        expect(canViewAuditTrail(notEntitled)).toBe(false);
    });

    it('gates recording and visibility independently, so an account can be recorded without seeing it', () => {
        setup({ hasAuditTrail: true, hasPlan: true });
        const recordedOnly = { has_audit_trail_control_plane: true, has_audit_trail_ui: false };

        expect(canRecordAuditTrail(recordedOnly)).toBe(true);
        expect(canViewAuditTrail(recordedOnly)).toBe(false);
    });

    it('denies a missing plan rather than falling open', () => {
        setup({ hasAuditTrail: true, hasPlan: true });

        expect(canRecordAuditTrail(null)).toBe(false);
        expect(canViewAuditTrail(undefined)).toBe(false);
    });
});
