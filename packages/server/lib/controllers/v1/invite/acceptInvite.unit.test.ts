import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { roles } from '@nangohq/utils';

import { acceptInvite } from './acceptInvite.js';
import { envs } from '../../../env.js';

import type * as NangoUtils from '@nangohq/utils';
import type { Request, Response } from 'express';

const { mockAcceptInvitation, mockGetInvitation, mockGetPlan, mockUpdateUser } = vi.hoisted(() => {
    return {
        mockAcceptInvitation: vi.fn(),
        mockGetInvitation: vi.fn(),
        mockGetPlan: vi.fn(),
        mockUpdateUser: vi.fn()
    };
});

vi.mock('@nangohq/database', () => ({
    default: { knex: {} }
}));

vi.mock('@nangohq/shared', () => ({
    acceptInvitation: mockAcceptInvitation,
    getInvitation: mockGetInvitation,
    getPlan: mockGetPlan,
    userService: {
        update: mockUpdateUser
    }
}));

vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');

    return {
        ...actual,
        flagHasPlan: false
    };
});

const nonDefaultRole = roles.find((role) => role !== envs.DEFAULT_USER_ROLE);

if (!nonDefaultRole) {
    throw new Error('Expected a non-default role for invite acceptance tests');
}

describe('acceptInvite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAcceptInvitation.mockResolvedValue(undefined);
        mockUpdateUser.mockResolvedValue({ id: 2, account_id: 3, role: nonDefaultRole });
    });

    it('preserves the invited role when plan mode is disabled', async () => {
        const invitationId = crypto.randomUUID();
        mockGetInvitation.mockResolvedValue({
            token: invitationId,
            email: 'invitee@example.com',
            account_id: 3,
            role: nonDefaultRole
        });

        const req = {
            params: { id: invitationId },
            query: {},
            route: { path: '/api/v1/invite/:id' },
            originalUrl: '/api/v1/invite/:id',
            header: vi.fn(),
            session: {
                passport: {},
                save: vi.fn((callback: (err?: Error) => void) => callback())
            }
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            locals: {
                user: { id: 2, email: 'invitee@example.com' }
            },
            status,
            send
        } as unknown as Response;

        await acceptInvite(req, res, vi.fn());

        expect(mockGetPlan).not.toHaveBeenCalled();
        expect(mockUpdateUser).toHaveBeenCalledWith({ id: 2, account_id: 3, role: nonDefaultRole });
        expect(status).toHaveBeenCalledWith(200);
        expect(send).toHaveBeenCalledWith({ data: { success: true } });
    });
});
