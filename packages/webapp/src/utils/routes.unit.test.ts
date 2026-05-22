import { describe, expect, it } from 'vitest';

import { isNonEnvPath } from './routes.js';

describe('isNonEnvPath', () => {
    describe('direct non-env paths', () => {
        it('matches exact non-env paths', () => {
            expect(isNonEnvPath('/team-settings')).toBe(true);
            expect(isNonEnvPath('/user-settings')).toBe(true);
            expect(isNonEnvPath('/team/billing')).toBe(true);
            expect(isNonEnvPath('/account-settings')).toBe(true);
            expect(isNonEnvPath('/onboarding/hear-about-us')).toBe(true);
        });

        it('matches non-env paths with sub-paths', () => {
            expect(isNonEnvPath('/team-settings/members')).toBe(true);
            expect(isNonEnvPath('/team/billing/plans')).toBe(true);
        });

        it('does not match env-specific paths', () => {
            expect(isNonEnvPath('/dev/integrations')).toBe(false);
            expect(isNonEnvPath('/prod/connections')).toBe(false);
            expect(isNonEnvPath('/staging/logs')).toBe(false);
        });

        it('does not match paths that share a prefix but differ by segment boundary', () => {
            expect(isNonEnvPath('/team-settings-prod')).toBe(false);
            expect(isNonEnvPath('/user-settings-backup')).toBe(false);
            expect(isNonEnvPath('/teams')).toBe(false);
        });
    });

    describe('legacy env-prefixed paths', () => {
        it('matches legacy /:env/team-settings style URLs', () => {
            expect(isNonEnvPath('/dev/team-settings')).toBe(true);
            expect(isNonEnvPath('/prod/user-settings')).toBe(true);
            expect(isNonEnvPath('/staging/team/billing')).toBe(true);
            expect(isNonEnvPath('/dev/account-settings')).toBe(true);
        });

        it('matches legacy /:env paths with sub-paths', () => {
            expect(isNonEnvPath('/dev/team-settings/members')).toBe(true);
            expect(isNonEnvPath('/prod/team/billing/plans')).toBe(true);
        });

        it('does not match env-specific paths with similar segment names', () => {
            expect(isNonEnvPath('/dev/integrations')).toBe(false);
            expect(isNonEnvPath('/team-settings-prod/integrations')).toBe(false);
        });
    });
});
