import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { withAnyScope as withAnyScopeAlias, withScope as withScopeAlias } from '../middleware/scope.middleware.js';
import { can, withAnyScope, withScope } from './middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyPrincipal, DBEnvironment, DBTeam, DBUser } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;

function key(scopes: string[], environmentIds: number[] = [5]): ApiKeyPrincipal {
    return { type: 'api_key', source: 'customer_key', accountId: 1, scopes, environmentIds };
}

function locals(over: Partial<RequestLocals> = {}): Partial<RequestLocals> {
    return { account, environment, apiKeyPrincipal: key(['environment:deploy']), ...over };
}

function run(middleware: ReturnType<typeof can>, requestLocals: Partial<RequestLocals>) {
    const res = {
        locals: requestLocals,
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    middleware({} as Request, res as unknown as Response<unknown, Partial<RequestLocals>>, next as unknown as NextFunction);
    return { next, status: res.status, json: res.json };
}

describe('can', () => {
    const originalFlag = flags.hasAuthRoles;
    beforeAll(() => {
        flags.hasAuthRoles = true;
    });
    afterAll(() => {
        flags.hasAuthRoles = originalFlag;
    });

    it('is the function exported as withScope and withAnyScope', () => {
        expect(withScope).toBe(can);
        expect(withAnyScope).toBe(can);
        expect(withScopeAlias).toBe(can);
        expect(withAnyScopeAlias).toBe(can);
    });

    it('calls next() when the principal holds the scope', () => {
        const { next, status } = run(can('environment:deploy'), locals());

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it('responds 403 naming the required scope', () => {
        const { next, status, json } = run(can('environment:deploy'), locals({ apiKeyPrincipal: key(['environment:proxy']) }));

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({ error: { code: 'forbidden', message: 'Insufficient scope. Required: environment:deploy' } });
    });

    it('responds 403 naming every accepted scope', () => {
        const { next, status, json } = run(can('environment:deploy', 'environment:proxy'), locals({ apiKeyPrincipal: key(['environment:logs:read']) }));

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({
            error: { code: 'forbidden', message: 'Insufficient scope. Required one of: environment:deploy or environment:proxy' }
        });
    });

    it('calls next() exactly once when any listed scope is held', () => {
        const { next } = run(can('environment:deploy', 'environment:proxy'), locals({ apiKeyPrincipal: key(['environment:deploy', 'environment:proxy']) }));

        expect(next).toHaveBeenCalledOnce();
    });

    it('names the scope on a denied private-route role', () => {
        const user = { id: 7, role: 'production_support', email: 'a@b.c' } as DBUser;
        const { next, status, json } = run(can('account:team:update'), { account, user, plan: { has_rbac: true } as RequestLocals['plan'] });

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({ error: { code: 'forbidden', message: 'Insufficient scope. Required: account:team:update' } });
    });

    it('responds 400 when an environment scope is checked with no environment', () => {
        const { next, status, json } = run(can('environment:deploy'), { account, apiKeyPrincipal: key(['environment:deploy']) });

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith({ error: { code: 'missing_environment' } });
    });

    it('still answers an account scope with no environment', () => {
        const { next, status } = run(can('account:environments:list'), { account, apiKeyPrincipal: key(['account:*'], []) });

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it('responds 500 when nothing authenticated onto a principal', () => {
        const { next, status, json } = run(can('environment:deploy'), { account, environment });

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith({ error: { code: 'missing_principal' } });
    });
});
