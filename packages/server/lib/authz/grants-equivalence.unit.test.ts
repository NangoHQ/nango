import { describe, expect, it } from 'vitest';

import { ISSUABLE_SCOPES } from '@nangohq/authz';
import { buildSandboxApiKeyScopes } from '@nangohq/shared';
import { authorizeApiKey } from '@nangohq/utils';

import { principalCan } from './principal.js';

import type { RequestLocals } from '../utils/express.js';
import type { IssuableScope } from '@nangohq/authz';
import type { ApiKeyAuthorizationTarget, ApiKeyPrincipal, CustomerKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;

function key(scopes: string[], environmentIds: number[], source: ApiKeyPrincipal['source'] = 'customer_key'): ApiKeyPrincipal {
    return { type: 'api_key', source, accountId: 1, scopes, environmentIds };
}

function localsFor(principal: ApiKeyPrincipal): Partial<RequestLocals> {
    return { account, environment, apiKeyPrincipal: principal };
}

function publicTarget(scope: IssuableScope, requestLocals: Partial<RequestLocals>): ApiKeyAuthorizationTarget | null {
    if (!requestLocals.account) {
        return null;
    }
    if (scope.startsWith('account:')) {
        return { type: 'account', accountId: requestLocals.account.id };
    }
    if (!requestLocals.environment) {
        return null;
    }
    return { type: 'environment', accountId: requestLocals.account.id, environmentId: requestLocals.environment.id };
}

function authorizeApiKeyOnLocals(requestLocals: Partial<RequestLocals>, scope: IssuableScope): boolean {
    const principal = requestLocals.apiKeyPrincipal;
    const target = publicTarget(scope, requestLocals);
    return Boolean(principal && target && authorizeApiKey({ principal, requiredScope: scope as CustomerKeyScope, target }));
}

const parentDryrunScopes = ['environment:functions:dryrun'];

const fixtures: { name: string; principal: ApiKeyPrincipal }[] = [
    { name: 'concrete scope', principal: key(['environment:connections:read'], [5]) },
    { name: 'environment:*', principal: key(['environment:*'], [5]) },
    { name: 'environment:integrations:*', principal: key(['environment:integrations:*'], [5]) },
    { name: 'account key', principal: key(['account:environments:list'], []) },
    { name: 'wrong env id', principal: key(['environment:*'], [9]) },
    { name: 'empty scopes', principal: key([], [5]) },
    { name: 'empty environmentIds', principal: key(['environment:*'], []) },
    { name: 'account:* asked for an environment scope', principal: key(['account:*'], []) },
    { name: 'env_var', principal: key(['environment:*'], [5], 'env_var') },
    { name: 'api_secret', principal: key(['environment:*'], [5], 'api_secret') },
    {
        name: 'sandbox_token dryrun',
        principal: key(buildSandboxApiKeyScopes({ purpose: 'dryrun', parentScopes: parentDryrunScopes }), [5], 'sandbox_token')
    },
    {
        name: 'sandbox_token deploy',
        principal: key(buildSandboxApiKeyScopes({ purpose: 'deploy', parentScopes: ['environment:*'] }), [5], 'sandbox_token')
    },
    { name: 'connect_session', principal: key(['environment:integrations:list'], [5], 'connect_session') },
    { name: 'customer_key', principal: key(['environment:connections:read', 'environment:proxy'], [5], 'customer_key') }
];

describe('principalCan ≡ authorizeApiKey on issuable scopes', () => {
    it.each(fixtures)('$name', ({ principal }) => {
        const requestLocals = localsFor(principal);
        for (const scope of ISSUABLE_SCOPES) {
            expect(principalCan(requestLocals, scope), scope).toBe(authorizeApiKeyOnLocals(requestLocals, scope));
        }
    });
});
