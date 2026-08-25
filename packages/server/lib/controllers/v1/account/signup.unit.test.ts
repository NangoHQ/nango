import crypto from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok, roles } from '@nangohq/utils';

import { envs } from '../../../env.js';
import { signup } from './signup.js';

import type * as NangoUtils from '@nangohq/utils';
import type { Request, Response } from 'express';

const {
    mockAcceptInvitation,
    mockGetInvitation,
    mockGetPlan,
    mockGetAccountById,
    mockGetUserByEmail,
    mockPbkdf2,
    mockCreateUser,
    mockSendVerificationEmail,
    mockValidateInvitation
} = vi.hoisted(() => {
    return {
        mockAcceptInvitation: vi.fn(),
        mockGetInvitation: vi.fn(),
        mockGetPlan: vi.fn(),
        mockGetAccountById: vi.fn(),
        mockGetUserByEmail: vi.fn(),
        mockPbkdf2: vi.fn(),
        mockCreateUser: vi.fn(),
        mockSendVerificationEmail: vi.fn(),
        mockValidateInvitation: vi.fn()
    };
});

vi.mock('@nangohq/database', () => ({
    default: { knex: {} }
}));

vi.mock('@nangohq/shared', () => ({
    acceptInvitation: mockAcceptInvitation,
    accountService: {
        getAccountById: mockGetAccountById
    },
    getInvitation: mockGetInvitation,
    getPlan: mockGetPlan,
    pbkdf2: mockPbkdf2,
    validateInvitation: mockValidateInvitation,
    userService: {
        getUserByEmail: mockGetUserByEmail,
        createUser: mockCreateUser
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
    sendVerificationEmail: mockSendVerificationEmail
}));

const nonDefaultRole = roles.find((role) => role !== envs.DEFAULT_USER_ROLE);

if (!nonDefaultRole) {
    throw new Error('Expected a non-default role for signup tests');
}

describe('signup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAcceptInvitation.mockResolvedValue(undefined);
        mockPbkdf2.mockResolvedValue(Buffer.from('hashed-password'));
        mockGetAccountById.mockResolvedValue({ id: 7 });
        mockGetUserByEmail.mockResolvedValue(null);
        mockCreateUser.mockResolvedValue({ uuid: crypto.randomUUID(), id: 11, account_id: 7, role: nonDefaultRole });
        mockValidateInvitation.mockImplementation((invitation: { email: string } | null, expectedEmail: string) => {
            if (!invitation || invitation.email.toLowerCase() !== expectedEmail.toLowerCase()) {
                return Err(Object.assign(new Error('Invitation does not exist or is expired'), { code: 'not_found' }));
            }
            return Ok(invitation);
        });
    });

    it('preserves the invited role at signup when plan mode is disabled', async () => {
        const invitationToken = crypto.randomUUID();
        const email = 'invitee@example.com';

        mockGetInvitation.mockResolvedValue({
            token: invitationToken,
            email: 'Invitee@Example.com',
            account_id: 7,
            role: nonDefaultRole
        });

        const req = {
            body: { email, name: 'Invited User', password: 'Password123!', token: invitationToken },
            query: {},
            route: { path: '/api/v1/account/signup' },
            originalUrl: '/api/v1/account/signup',
            header: vi.fn(),
            login: vi.fn((_user: unknown, callback: (err?: Error) => void) => callback())
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            status,
            send
        } as unknown as Response;

        const next = vi.fn();

        await signup(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(mockGetUserByEmail).toHaveBeenCalledWith(email);
        expect(mockGetInvitation).toHaveBeenCalledWith(invitationToken);
        expect(mockGetAccountById).toHaveBeenCalledWith({}, 7);
        expect(mockGetPlan).not.toHaveBeenCalled();
        expect(mockAcceptInvitation).toHaveBeenCalledWith(invitationToken);
        expect(mockPbkdf2).toHaveBeenCalled();
        expect(mockCreateUser).toHaveBeenCalledWith(
            expect.objectContaining({
                email,
                account_id: 7,
                role: nonDefaultRole
            })
        );
        expect(status).toHaveBeenCalledWith(200);
        const payload = send.mock.calls[0]?.[0] as { data: { uuid: string; verified: boolean } } | undefined;

        expect(payload?.data.verified).toBe(true);
        expect(typeof payload?.data.uuid).toBe('string');
    });

    it('rejects an invitation used with a different email without consuming it', async () => {
        const invitationToken = crypto.randomUUID();
        const invitedEmail = 'invitee@example.com';
        const submittedEmail = 'attacker@example.com';

        mockGetInvitation.mockResolvedValue({
            token: invitationToken,
            email: invitedEmail,
            account_id: 7,
            role: nonDefaultRole
        });

        const login = vi.fn();
        const req = {
            body: { email: submittedEmail, name: 'Attacker', password: 'Password123!', token: invitationToken },
            query: {},
            route: { path: '/api/v1/account/signup' },
            originalUrl: '/api/v1/account/signup',
            header: vi.fn(),
            login
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = {
            status,
            send
        } as unknown as Response;

        await signup(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(400);
        expect(send).toHaveBeenCalledWith({ error: { code: 'not_found', message: 'Invitation does not exist or is expired' } });
        expect(mockGetAccountById).not.toHaveBeenCalled();
        expect(mockAcceptInvitation).not.toHaveBeenCalled();
        expect(mockPbkdf2).not.toHaveBeenCalled();
        expect(mockCreateUser).not.toHaveBeenCalled();
        expect(login).not.toHaveBeenCalled();
    });

    it('allows enterprise admin signup with its synthetic invitation', async () => {
        const invitationToken = crypto.randomUUID();
        const email = 'admin@example.com';

        mockGetInvitation.mockResolvedValue({
            token: '',
            email: '',
            account_id: 0,
            invited_by: 0,
            accepted: true,
            role: 'administrator'
        });
        mockValidateInvitation.mockImplementation((invitation) => Ok(invitation));
        mockGetAccountById.mockResolvedValue({ id: 0 });
        const login = vi.fn((_user: unknown, callback: (err?: Error) => void) => callback());
        const req = {
            body: { email, name: 'Admin', password: 'Password123!', token: invitationToken },
            query: {},
            route: { path: '/api/v1/account/signup' },
            originalUrl: '/api/v1/account/signup',
            header: vi.fn(),
            login
        } as unknown as Request;
        const status = vi.fn().mockReturnThis();
        const send = vi.fn().mockReturnThis();
        const res = { status, send } as unknown as Response;

        await signup(req, res, vi.fn());

        expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({ email, account_id: 0, email_verified: true, role: 'administrator' }));
        expect(status).toHaveBeenCalledWith(200);
    });
});
