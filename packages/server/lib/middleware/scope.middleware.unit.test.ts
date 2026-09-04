import { describe, expect, it, vi } from 'vitest';

import { hasAuthorizedScope, withAnyScope, withEnvironmentTarget, withScope } from './scope.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyPrincipal, DBEnvironment, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const accountId = 10;
const environmentId = 100;

const account = { id: accountId } as DBTeam;
const environment = { id: environmentId } as DBEnvironment;

function principal(overrides: Partial<ApiKeyPrincipal> = {}): ApiKeyPrincipal {
    return {
        type: 'api_key',
        source: 'customer_key',
        accountId,
        scopes: ['account:*', 'environment:*'],
        environmentIds: [environmentId],
        ...overrides
    };
}

function locals(overrides: Partial<RequestLocals> = {}): Partial<RequestLocals> {
    return { account, environment, apiKeyPrincipal: principal(), ...overrides };
}

// `exactOptionalPropertyTypes` rules out `{ environment: undefined }`, so absent locals are built by omission.
const withoutAccount: Partial<RequestLocals> = { environment, apiKeyPrincipal: principal() };
const withoutEnvironment: Partial<RequestLocals> = { account, apiKeyPrincipal: principal() };
const withoutPrincipal: Partial<RequestLocals> = { account, environment };

type ScopeMiddleware = (req: Request, res: Response<unknown, Partial<RequestLocals>>, next: NextFunction) => void;

function run(middleware: ScopeMiddleware, requestLocals: Partial<RequestLocals>) {
    const res = {
        locals: requestLocals,
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    middleware({} as Request, res as unknown as Response<unknown, Partial<RequestLocals>>, next as unknown as NextFunction);

    return { next, status: res.status, json: res.json };
}

describe('hasAuthorizedScope', () => {
    it('authorizes an environment scope for a key bound to that environment', () => {
        expect(hasAuthorizedScope({ locals: locals(), requiredScope: 'environment:deploy' })).toBe(true);
    });

    it('authorizes an account scope against the account plane', () => {
        expect(hasAuthorizedScope({ locals: locals(), requiredScope: 'account:environments:create' })).toBe(true);
    });

    // An `account:` scope resolves to an account target, which is why it needs no environment binding.
    // Resolving it against the environment plane instead would deny this.
    it('authorizes an account scope for a key with no environment binding at all', () => {
        const requestLocals = {
            account,
            apiKeyPrincipal: principal({ scopes: ['account:environments:create'], environmentIds: [] })
        };

        expect(hasAuthorizedScope({ locals: requestLocals, requiredScope: 'account:environments:create' })).toBe(true);
    });

    it('denies an environment scope when locals carry no environment', () => {
        expect(hasAuthorizedScope({ locals: withoutEnvironment, requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('denies both planes when locals carry no account', () => {
        expect(hasAuthorizedScope({ locals: withoutAccount, requiredScope: 'environment:deploy' })).toBe(false);
        expect(hasAuthorizedScope({ locals: withoutAccount, requiredScope: 'account:environments:create' })).toBe(false);
    });

    it('denies when locals carry no API key principal', () => {
        expect(hasAuthorizedScope({ locals: withoutPrincipal, requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('denies an environment scope when the key is bound to a different environment', () => {
        const requestLocals = locals({ apiKeyPrincipal: principal({ environmentIds: [environmentId + 1] }) });

        expect(hasAuthorizedScope({ locals: requestLocals, requiredScope: 'environment:deploy' })).toBe(false);
    });

    it('denies both planes when the key belongs to a different account', () => {
        const requestLocals = locals({ apiKeyPrincipal: principal({ accountId: accountId + 1 }) });

        expect(hasAuthorizedScope({ locals: requestLocals, requiredScope: 'environment:deploy' })).toBe(false);
        expect(hasAuthorizedScope({ locals: requestLocals, requiredScope: 'account:environments:create' })).toBe(false);
    });

    it('denies a scope the key was not granted', () => {
        const requestLocals = locals({ apiKeyPrincipal: principal({ scopes: ['environment:connections:read'] }) });

        expect(hasAuthorizedScope({ locals: requestLocals, requiredScope: 'environment:deploy' })).toBe(false);
    });
});

describe('withEnvironmentTarget', () => {
    it('calls next() for an OAuth grant with authorized environments', () => {
        const { next, status } = run(withEnvironmentTarget, {
            authType: 'mcpOAuth',
            account,
            mcpOAuthEnvironments: [environment]
        });

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it('calls next() for a key bound to the environment', () => {
        const { next, status } = run(withEnvironmentTarget, locals());

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    // Ownership-only by design: the routes behind this gate have no scope requirement.
    it('calls next() even when the key holds no scopes', () => {
        const { next, status } = run(withEnvironmentTarget, locals({ apiKeyPrincipal: principal({ scopes: [] }) }));

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it.each([
        ['no account', withoutAccount],
        ['no environment', withoutEnvironment],
        ['no principal', withoutPrincipal],
        ['a key bound to another environment', locals({ apiKeyPrincipal: principal({ environmentIds: [environmentId + 1] }) })],
        ['a key from another account', locals({ apiKeyPrincipal: principal({ accountId: accountId + 1 }) })]
    ])('responds 403 and does not call next() with %s', (_label, requestLocals) => {
        const { next, status, json } = run(withEnvironmentTarget, requestLocals);

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({ error: { code: 'forbidden', message: 'API key is not authorized for an environment' } });
    });
});

describe('withScope', () => {
    it('calls next() when the key holds the scope', () => {
        const { next, status } = run(withScope('environment:deploy'), locals({ apiKeyPrincipal: principal({ scopes: ['environment:deploy'] }) }));

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it('responds 403 naming the required scope and does not call next()', () => {
        const { next, status, json } = run(withScope('environment:deploy'), locals({ apiKeyPrincipal: principal({ scopes: ['environment:proxy'] }) }));

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({ error: { code: 'forbidden', message: 'Insufficient scope. Required: environment:deploy' } });
    });
});

describe('withAnyScope', () => {
    const middleware = withAnyScope('environment:deploy', 'environment:proxy');

    it('calls next() when the key holds the first accepted scope', () => {
        const { next, status } = run(middleware, locals({ apiKeyPrincipal: principal({ scopes: ['environment:deploy'] }) }));

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    // any-of, not all-of: holding only the last listed scope is enough.
    it('calls next() when the key holds only the last accepted scope', () => {
        const { next, status } = run(middleware, locals({ apiKeyPrincipal: principal({ scopes: ['environment:proxy'] }) }));

        expect(next).toHaveBeenCalledOnce();
        expect(status).not.toHaveBeenCalled();
    });

    it('calls next() exactly once when the key holds every accepted scope', () => {
        const { next } = run(middleware, locals({ apiKeyPrincipal: principal({ scopes: ['environment:deploy', 'environment:proxy'] }) }));

        expect(next).toHaveBeenCalledOnce();
    });

    it('responds 403 naming every accepted scope and does not call next()', () => {
        const { next, status, json } = run(middleware, locals({ apiKeyPrincipal: principal({ scopes: ['environment:logs:read'] }) }));

        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({
            error: { code: 'forbidden', message: 'Insufficient scope. Required one of: environment:deploy or environment:proxy' }
        });
    });
});
