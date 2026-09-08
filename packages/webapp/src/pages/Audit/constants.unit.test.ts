import { describe, expect, it } from 'vitest';

import { actionSelectionLabel, environmentLabel, resourceSelectionLabel } from './constants';

describe('resourceSelectionLabel', () => {
    it('reads as All when nothing narrows the resource', () => {
        expect(resourceSelectionLabel([])).toBe('All');
    });

    it('uses the names the dropdown offered, not the raw vocabulary', () => {
        expect(resourceSelectionLabel(['api_key', 'app_auth'])).toBe('API key, Authentication');
    });
});

describe('actionSelectionLabel', () => {
    it('reads as All when nothing narrows the action', () => {
        expect(actionSelectionLabel([])).toBe('All');
    });

    it('uses the names the dropdown offered, not the raw vocabulary', () => {
        expect(actionSelectionLabel(['metadata_updated', 'deleted'])).toBe('Metadata updated, Deleted');
    });
});

describe('environmentLabel', () => {
    it('names the environment when the event carries one', () => {
        expect(environmentLabel({ environment: { id: '1', display: 'dev' }, scope: 'environment' })).toBe('dev');
    });

    it('calls an account-scoped event account-level rather than leaving it blank', () => {
        expect(environmentLabel({ environment: null, scope: 'account' })).toBe('Account-level');
    });

    it('does not claim account-level for an environment-scoped event that stored no environment', () => {
        expect(environmentLabel({ environment: null, scope: 'environment' })).toBe('—');
    });

    it('falls back to account-level on events recorded before scope existed', () => {
        expect(environmentLabel({ environment: null } as Parameters<typeof environmentLabel>[0])).toBe('Account-level');
    });
});
