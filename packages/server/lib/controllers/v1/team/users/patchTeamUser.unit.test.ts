import { beforeEach, describe, expect, it, vi } from 'vitest';

import { roles } from '@nangohq/utils';

import { patchTeamUser } from './patchTeamUser.js';
import { envs } from '../../../../env.js';

import type * as NangoUtils from '@nangohq/utils';
import type { Request, Response } from 'express';

const { mockGetUserById, mockUpdateUser } = vi.hoisted(() => {
    return {
        mockGetUserById: vi.fn(),
        mockUpdateUser: vi.fn()
    };
});

vi.mock('@nangohq/shared', () => ({
    userService: {
        getUserById: mockGetUserById,
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
    throw new Error('Expected a non-default role for team user tests');
}

describe('patchTeamUser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetUserById.mockResolvedValue({ id: 5, account_id: 1, role: envs.DEFAULT_USER_ROLE });
        mockUpdateUser.mockResolvedValue({ id: 5, account_id: 1, role: nonDefaultRole });
    });

    it('allows non-default role updates when plan mode is disabled', async () => {
        const req = {
            params: { id: 5 },
            body: { role: nonDefaultRole },
            query: { env: 'dev' },
            route: { path: '/api/v1/team/users/:id' },
            originalUrl: '/api/v1/team/users/5',
            header: vi.fn()
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            locals: {
                account: { id: 1 },
                user: { id: 2 },
                plan: null
            },
            status,
            send
        } as unknown as Response;

        await patchTeamUser(req, res, vi.fn());

        expect(mockUpdateUser).toHaveBeenCalledWith({ id: 5, role: nonDefaultRole });
        expect(status).toHaveBeenCalledWith(200);
        expect(send).toHaveBeenCalledWith({ data: { success: true } });
    });
});
