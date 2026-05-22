import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { declineInvite } from './declineInvite.js';

import type { Request, Response } from 'express';

const { mockDeclineInvitation, mockGetInvitation } = vi.hoisted(() => {
    return {
        mockDeclineInvitation: vi.fn(),
        mockGetInvitation: vi.fn()
    };
});

vi.mock('@nangohq/shared', () => ({
    declineInvitation: mockDeclineInvitation,
    getInvitation: mockGetInvitation
}));

describe('declineInvite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDeclineInvitation.mockResolvedValue(true);
    });

    it('matches invite emails case-insensitively', async () => {
        const invitationId = crypto.randomUUID();
        mockGetInvitation.mockResolvedValue({
            token: invitationId,
            email: 'invitee@example.com'
        });

        const req = {
            params: { id: invitationId },
            query: {},
            route: { path: '/api/v1/invite/:id' },
            originalUrl: '/api/v1/invite/:id',
            header: vi.fn()
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            locals: {
                user: { email: 'Invitee@example.com' }
            },
            status,
            send
        } as unknown as Response;

        await declineInvite(req, res, vi.fn());

        expect(mockDeclineInvitation).toHaveBeenCalledWith(invitationId);
        expect(status).toHaveBeenCalledWith(200);
        expect(send).toHaveBeenCalledWith({ data: { success: true } });
    });
});
