import { afterEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { canAccessAuditTrail, canRecordAuditTrail, canViewAuditTrail } from './auditTrail.js';

import type * as NangoUtils from '@nangohq/utils';

// `flagHasPlan` is a const export, so it can only be varied per test through the module mock.
const planFlag = vi.hoisted(() => ({ enabled: true }));
const backendFlag = vi.hoisted(() => ({ configured: true }));
vi.mock('../audit.js', () => ({ auditBackend: backendFlag }));
vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');
    return {
        ...actual,
        get flagHasPlan() {
            return planFlag.enabled;
        }
    };
});

const customer = { session: {} } as Parameters<typeof canViewAuditTrail>[0];
const operator = { session: { impersonatedBy: { accountId: 1, accountName: 'Nango', actorId: 7 } } } as Parameters<typeof canViewAuditTrail>[0];
const entitled = { has_audit_trail_control_plane: true, has_audit_trail_access: true };
const notEntitled = { has_audit_trail_control_plane: false, has_audit_trail_access: false };

function setup({ optIn, hasPlan, backend = true }: { optIn: boolean; hasPlan: boolean; backend?: boolean }) {
    flags.hasAuditTrail = optIn;
    planFlag.enabled = hasPlan;
    backendFlag.configured = backend;
}

describe('audit trail entitlement', () => {
    afterEach(() => {
        flags.hasAuditTrail = false;
        planFlag.enabled = true;
        backendFlag.configured = true;
        vi.restoreAllMocks();
    });

    describe('the deployment opt-in', () => {
        it('turns everything on without a flag provider or a plan (local dev)', async () => {
            setup({ optIn: true, hasPlan: false });

            await expect(canRecordAuditTrail(null)).resolves.toBe(true);
            await expect(canAccessAuditTrail(null)).resolves.toBe(true);
        });

        it('stays off when the deployment opted in with nowhere to keep the trail', async () => {
            setup({ optIn: true, hasPlan: false, backend: false });

            await expect(canRecordAuditTrail(null)).resolves.toBe(false);
            await expect(canAccessAuditTrail(null)).resolves.toBe(false);
        });
    });

    describe('without the opt-in, so the plan decides', () => {
        it('honours the plan, so an unentitled account stays off', async () => {
            setup({ optIn: false, hasPlan: true });

            await expect(canRecordAuditTrail(entitled)).resolves.toBe(true);
            await expect(canAccessAuditTrail(entitled)).resolves.toBe(true);
            await expect(canRecordAuditTrail(notEntitled)).resolves.toBe(false);
            await expect(canAccessAuditTrail(notEntitled)).resolves.toBe(false);
        });

        it('gates recording and visibility independently, so an account can be recorded without seeing it', async () => {
            setup({ optIn: false, hasPlan: true });
            const recordedOnly = { has_audit_trail_control_plane: true, has_audit_trail_access: false };

            await expect(canRecordAuditTrail(recordedOnly)).resolves.toBe(true);
            await expect(canAccessAuditTrail(recordedOnly)).resolves.toBe(false);
        });

        it('denies a missing plan rather than falling open', async () => {
            setup({ optIn: false, hasPlan: true });

            await expect(canRecordAuditTrail(null)).resolves.toBe(false);
            await expect(canAccessAuditTrail(undefined)).resolves.toBe(false);
        });

        it('stays off where there are no plans to read an entitlement from', async () => {
            setup({ optIn: false, hasPlan: false });

            await expect(canRecordAuditTrail(entitled)).resolves.toBe(false);
            await expect(canAccessAuditTrail(entitled)).resolves.toBe(false);
        });
    });

    describe('what a session can view', () => {
        it('holds the customer to the access entitlement', async () => {
            setup({ optIn: false, hasPlan: true });

            await expect(canViewAuditTrail(customer, { has_audit_trail_control_plane: true, has_audit_trail_access: false })).resolves.toBe(false);
            await expect(canViewAuditTrail(customer, entitled)).resolves.toBe(true);
        });

        it('lets an impersonating operator past the access entitlement', async () => {
            setup({ optIn: false, hasPlan: true });

            await expect(canViewAuditTrail(operator, { has_audit_trail_control_plane: true, has_audit_trail_access: false })).resolves.toBe(true);
        });

        it('still hides it from the operator when the account is not recorded, so an empty page cannot mislead', async () => {
            setup({ optIn: false, hasPlan: true });

            await expect(canViewAuditTrail(operator, { has_audit_trail_control_plane: false, has_audit_trail_access: true })).resolves.toBe(false);
            await expect(canViewAuditTrail(operator, notEntitled)).resolves.toBe(false);
        });
    });
});
