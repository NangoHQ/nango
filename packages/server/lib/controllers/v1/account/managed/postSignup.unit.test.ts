import { beforeEach, describe, expect, it, vi } from 'vitest';

import { postManagedSignup } from './postSignup.js';

import type { NextFunction, Request, Response } from 'express';

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), authorization: vi.fn(), encode: vi.fn() }));
vi.mock('../../../../clients/workos.client.js', () => ({
    getWorkOSClient: () => ({ userManagement: { getAuthorizationUrl: mocks.authorization } })
}));
vi.mock('../../../../services/advertisingConsent.service.js', () => ({ prepareManagedSignupConsent: mocks.prepare }));
vi.mock('./auth.js', () => ({ encodeManagedAuthState: mocks.encode }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepare.mockResolvedValue('a'.repeat(64));
    mocks.authorization.mockReturnValue('https://auth.example.com/authorize');
    mocks.encode.mockReturnValue('encoded-state');
});

describe('Google signup consent capture', () => {
    it.each([undefined, '/team/billing', '/onboarding'])('keeps consent with return destination %s', async (returnTo) => {
        const req = { body: { provider: 'GoogleOAuth', ...(returnTo ? { returnTo } : {}) }, query: {} } as Request;
        const res = { send: vi.fn() } as unknown as Response;
        const next = vi.fn() as NextFunction;
        await postManagedSignup(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(mocks.prepare).toHaveBeenCalledWith(req);
        expect(mocks.encode).toHaveBeenCalledWith(expect.objectContaining({ returnTo, consentNonce: 'a'.repeat(64) }));
        expect(res.send).toHaveBeenCalledWith({ data: { url: 'https://auth.example.com/authorize' } });
    });

    it('does not attach signup consent to an invitation', async () => {
        const token = '12345678-1234-4234-8234-123456789abc';
        const req = { body: { provider: 'GoogleOAuth', token, returnTo: '/team/billing' }, query: {} } as Request;
        const res = { send: vi.fn() } as unknown as Response;
        const next = vi.fn() as NextFunction;
        await postManagedSignup(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(mocks.prepare).not.toHaveBeenCalled();
        expect(mocks.encode).toHaveBeenCalledWith(expect.objectContaining({ token, consentNonce: undefined }));
    });
});
