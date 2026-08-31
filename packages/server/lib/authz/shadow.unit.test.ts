import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { recordScopeDivergence } from './shadow.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyPrincipal, CustomerKeyScope, DBEnvironment, DBTeam } from '@nangohq/types';
import type { MockInstance } from 'vitest';

const account = { id: 1 } as DBTeam;
const environment = { id: 5, account_id: 1, is_production: true } as DBEnvironment;

function localsFor(scopes: string[]): Partial<RequestLocals> {
    const apiKeyPrincipal: ApiKeyPrincipal = { type: 'api_key', source: 'customer_key', accountId: 1, scopes, environmentIds: [5] };
    return { account, environment, apiKeyPrincipal };
}

describe('recordScopeDivergence', () => {
    let increment: MockInstance<typeof metrics.increment>;
    beforeEach(() => {
        increment = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
    });
    afterEach(() => {
        increment.mockRestore();
    });

    const results = () =>
        increment.mock.calls
            .filter(([type]) => type === metrics.Types.AUTHZ_KEY_DERIVATION_COMPARISON)
            .map(([, , tags]) => tags as { result: string; reason?: string });
    const divergences = () => results().filter((tags) => tags.result === 'diverge');

    it('counts an agreement, so the graph has a denominator', () => {
        recordScopeDivergence({ locals: localsFor(['environment:*']), requiredScopes: ['environment:connections:read'], legacy: true });
        expect(results().map((tags) => tags.result)).toEqual(['agree']);
    });

    it('records when they disagree', () => {
        recordScopeDivergence({ locals: localsFor([]), requiredScopes: ['environment:connections:read'], legacy: true });
        expect(divergences()).toHaveLength(1);
    });

    it('tags an any-of set with no dogstatsd field separator in the value', () => {
        recordScopeDivergence({
            locals: localsFor(['environment:*']),
            requiredScopes: ['environment:connections:read', 'environment:connections:read_credentials'],
            legacy: true
        });
        const tags = increment.mock.calls.map(([, , t]) => t as { scope: string; result: string });
        expect(tags.every((t) => !/[|,#]/.test(t.scope))).toBe(true);
        expect(tags.map((t) => t.result)).toEqual(['agree']);
    });

    it('gives each scope in a mixed-plane any-of set its own target', () => {
        const mixed: CustomerKeyScope[] = ['environment:connections:read', 'account:environments:create'];

        // Only the account scope is held, and it needs an account target the environment scope would not get.
        recordScopeDivergence({ locals: localsFor(['account:environments:create']), requiredScopes: mixed, legacy: true });
        expect(divergences()).toHaveLength(0);

        // Reversed order, same answer — the first scope must not decide the target for the rest.
        recordScopeDivergence({ locals: localsFor(['account:environments:create']), requiredScopes: [...mixed].reverse(), legacy: true });
        expect(divergences()).toHaveLength(0);
    });

    const unmappedReasons = () =>
        results()
            .filter((tags) => tags.result === 'unmapped')
            .map((tags) => tags.reason);

    it('says why it could not compare', () => {
        recordScopeDivergence({ locals: { account }, requiredScopes: ['environment:connections:read'], legacy: true });
        expect(unmappedReasons()).toEqual(['no_principal']);
    });

    it('distinguishes a missing target from a missing principal', () => {
        const { environment: _dropped, ...withoutEnvironment } = localsFor(['environment:*']);
        recordScopeDivergence({ locals: withoutEnvironment, requiredScopes: ['environment:connections:read'], legacy: true });
        expect(unmappedReasons()).toEqual(['no_target']);
    });
});
