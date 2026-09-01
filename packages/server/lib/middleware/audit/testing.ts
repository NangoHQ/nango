import { EventEmitter } from 'node:events';

import { expect, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import type * as AuditModule from '../../audit.js';
import type * as NangoShared from '@nangohq/shared';
import type { RequestHandler } from 'express';
import type { Mock } from 'vitest';

// `vi.mock` and `vi.hoisted` are hoisted per test file and cannot be called from here, so each suite
// declares its own one-line `vi.mock` and delegates the body to the factories below.
export const recordMock: Mock = vi.fn();
export const getInvitationMock: Mock = vi.fn();
export const getAccountByIdMock: Mock = vi.fn();
export const getPlanSafeMock: Mock = vi.fn();
export const getEnvironmentByIdMock: Mock = vi.fn();
export const getEnvironmentByUuidMock: Mock = vi.fn();
export const getApiKeyByIdMock: Mock = vi.fn();
export const getAccountApiKeyByIdMock: Mock = vi.fn();
export const getApiKeyByUuidMock: Mock = vi.fn();
export const getIntegrationSummaryMock: Mock = vi.fn();
export const getConnectionByIdMock: Mock = vi.fn();
export const getUserByIdMock: Mock = vi.fn();

export async function auditModuleMock(importOriginal: () => Promise<typeof AuditModule>): Promise<object> {
    return { ...(await importOriginal()), recordAuditEvent: recordMock };
}

export async function sharedModuleMock(importOriginal: () => Promise<typeof NangoShared>): Promise<object> {
    const actual = await importOriginal();
    return {
        ...actual,
        getInvitation: getInvitationMock,
        getPlanSafe: getPlanSafeMock,
        environmentService: { ...actual.environmentService, getByIdWithoutSecrets: getEnvironmentByIdMock, getByUuidWithoutSecrets: getEnvironmentByUuidMock },
        customerKeyService: {
            ...actual.customerKeyService,
            getApiKeyById: getApiKeyByIdMock,
            getAccountApiKeyById: getAccountApiKeyByIdMock,
            getApiKeyByUuid: getApiKeyByUuidMock
        },
        configService: { ...actual.configService, getIntegrationSummary: getIntegrationSummaryMock },
        accountService: { ...actual.accountService, getAccountById: getAccountByIdMock },
        connectionService: { ...actual.connectionService, getConnectionById: getConnectionByIdMock },
        userService: { ...actual.userService, getUserById: getUserByIdMock }
    };
}

/**
 * No plans in a unit run, so the entitlement path resolves off; the deployment opt-in is what reaches the
 * middleware. Which gate lets a request through is covered in utils/auditTrail.unit.test.ts.
 */
export function installAuditMockDefaults(): void {
    recordMock.mockReset().mockResolvedValue(undefined);
    flags.hasAuditTrail = true;
    getPlanSafeMock.mockReset().mockResolvedValue(null);
}

export function resetAuditMocks(): void {
    flags.hasAuditTrail = false;
    vi.restoreAllMocks();
}

export function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        query: {},
        body: {},
        ip: '203.0.113.7',
        get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'vitest' : undefined),
        ...overrides
    } as any;
}

export function fakeRes(locals: Record<string, unknown>, statusCode = 200) {
    const res = new EventEmitter() as any;
    res.locals = locals;
    res.statusCode = statusCode;
    res.json = (body: unknown) => body;
    return res;
}

export const locals = {
    account: { id: 42, uuid: 'acc-uuid' },
    environment: { id: 9, uuid: 'e0000000-0000-4000-8000-000000000009', name: 'dev' },
    authType: 'session',
    user: { id: 7, email: 'dev@example.com' }
};

export const secretKeyLocals = {
    account: { id: 42, uuid: 'acc-uuid' },
    environment: { id: 9, uuid: 'e0000000-0000-4000-8000-000000000009', name: 'dev' },
    authType: 'secretKey',
    apiKeyId: 5,
    apiKeyUuid: 'c0000000-0000-4000-8000-000000000005',
    apiKeyDisplayName: 'ci-key'
};

/** Run the middleware, fire the response-finish event that triggers the emit, and return the recorded event. */
export async function runAudit(handler: RequestHandler, req: any, res: any) {
    await new Promise<void>((resolve) => handler(req, res, () => resolve()));
    res.emit('finish');
    await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
    return recordMock.mock.calls.at(-1)?.[0];
}
