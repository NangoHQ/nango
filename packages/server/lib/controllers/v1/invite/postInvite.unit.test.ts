import { beforeEach, describe, expect, it, vi } from 'vitest';

import { roles } from '@nangohq/utils';

import { postInvite } from './postInvite.js';

import type * as NangoUtils from '@nangohq/utils';
import type { Request, Response } from 'express';

const { mockTransaction, mockExpirePreviousInvitations, mockInviteEmail, mockGetUserByEmail, mockSendInviteEmail } = vi.hoisted(() => {
    return {
        mockTransaction: vi.fn(),
        mockExpirePreviousInvitations: vi.fn(),
        mockInviteEmail: vi.fn(),
        mockGetUserByEmail: vi.fn(),
        mockSendInviteEmail: vi.fn()
    };
});

vi.mock('@nangohq/database', () => ({
    default: { knex: { transaction: mockTransaction } }
}));

vi.mock('@nangohq/shared', () => ({
    expirePreviousInvitations: mockExpirePreviousInvitations,
    inviteEmail: mockInviteEmail,
    userService: {
        getUserByEmail: mockGetUserByEmail
    }
}));

vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');

    return {
        ...actual,
        flagHasPlan: false
    };
});

vi.mock('../../../helpers/email.js', () => ({
    sendInviteEmail: mockSendInviteEmail
}));

const nonAdminRole = roles.find((role) => role !== 'administrator');

if (!nonAdminRole) {
    throw new Error('Expected a non-administrator role for invite tests');
}

function createResponse() {
    const status = vi.fn().mockReturnThis();
    const send = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res = {
        locals: {
            account: { id: 1 },
            user: { id: 2 },
            plan: null
        },
        status,
        send,
        json
    } as unknown as Response;

    return { json, res, send, status };
}

describe('postInvite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTransaction.mockImplementation(async (callback: (trx: object) => Promise<unknown>) => {
            return await callback({});
        });
        mockGetUserByEmail.mockResolvedValue(null);
        mockExpirePreviousInvitations.mockResolvedValue(undefined);
        mockInviteEmail.mockResolvedValue({ token: 'invite-token' });
        mockSendInviteEmail.mockResolvedValue(undefined);
    });

    it('allows non-administrator invite roles when plan mode is disabled', async () => {
        const req = {
            body: { emails: ['invitee@example.com'], role: nonAdminRole },
            query: { env: 'dev' },
            route: { path: '/api/v1/invite' },
            originalUrl: '/api/v1/invite',
            header: vi.fn()
        } as unknown as Request;
        const { res, send, status } = createResponse();

        await postInvite(req, res, vi.fn());

        expect(mockInviteEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                email: 'invitee@example.com',
                role: nonAdminRole
            })
        );
        expect(status).toHaveBeenCalledWith(200);
        expect(send).toHaveBeenCalledWith({ data: { invited: ['invitee@example.com'] } });
    });
});
