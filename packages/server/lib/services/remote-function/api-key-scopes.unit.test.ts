import { describe, expect, it } from 'vitest';

import { buildDryrunSandboxScopes } from './api-key-scopes.js';

describe('remote function API key scopes', () => {
    it('keeps caller scopes and adds dryrun baseline scopes', () => {
        expect(buildDryrunSandboxScopes(['environment:dryrun', 'environment:records:read'])).toStrictEqual([
            'environment:dryrun',
            'environment:records:read',
            'environment:connections:read',
            'environment:integrations:read',
            'environment:proxy'
        ]);
    });

    it('does not duplicate baseline scopes already present on the caller key', () => {
        expect(buildDryrunSandboxScopes(['environment:dryrun', 'environment:proxy'])).toStrictEqual([
            'environment:dryrun',
            'environment:proxy',
            'environment:connections:read',
            'environment:integrations:read'
        ]);
    });

    it('keeps caller scopes as provided', () => {
        expect(buildDryrunSandboxScopes(['environment:dryrun', 'environment:connections:*'])).toStrictEqual([
            'environment:dryrun',
            'environment:connections:*',
            'environment:connections:read',
            'environment:integrations:read',
            'environment:proxy'
        ]);
    });

    it('keeps wildcard caller scopes and avoids duplicate baseline scopes', () => {
        expect(buildDryrunSandboxScopes(['environment:*', 'environment:proxy'])).toStrictEqual([
            'environment:*',
            'environment:proxy',
            'environment:connections:read',
            'environment:integrations:read'
        ]);
    });
});
