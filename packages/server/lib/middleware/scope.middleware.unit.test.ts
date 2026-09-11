import { describe, expect, it, vi } from 'vitest';

import { withEnvironmentTarget } from './scope.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyPrincipal, DBEnvironment, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const accountId = 10;
const environmentId = 100;

const account = { id: accountId } as DBTeam;
const environment = { id: environmentId, account_id: accountId, is_production: false } as DBEnvironment;

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

function run(middleware: typeof withEnvironmentTarget, requestLocals: Partial<RequestLocals>) {
    const res = {
        locals: requestLocals,
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    middleware({} as Request, res as unknown as Response<unknown, Partial<RequestLocals>>, next as unknown as NextFunction);

    return { next, status: res.status, json: res.json };
}

describe('withEnvironmentTarget', () => {
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
