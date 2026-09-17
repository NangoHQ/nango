import { describe, expect, it } from 'vitest';

import { isNonEnvPath, MAX_NEXT_LENGTH, signinPathWithNext } from './routes.js';

describe('isNonEnvPath', () => {
    describe('direct non-env paths', () => {
        it('matches exact non-env paths', () => {
            expect(isNonEnvPath('/team-settings')).toBe(true);
            expect(isNonEnvPath('/user-settings')).toBe(true);
            expect(isNonEnvPath('/team/billing')).toBe(true);
            expect(isNonEnvPath('/account-settings')).toBe(true);
            expect(isNonEnvPath('/onboarding/hear-about-us')).toBe(true);
            expect(isNonEnvPath('/api-keys')).toBe(true);
        });

        it('matches non-env paths with sub-paths', () => {
            expect(isNonEnvPath('/team-settings/members')).toBe(true);
            expect(isNonEnvPath('/team/billing/plans')).toBe(true);
            expect(isNonEnvPath('/api-keys/new')).toBe(true);
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

describe('signinPathWithNext', () => {
    const location = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });

    it('encodes the destination into the next param', () => {
        expect(signinPathWithNext(location('/team/billing'))).toBe('/signin?next=%2Fteam%2Fbilling');
    });

    it('keeps the search string and hash', () => {
        expect(signinPathWithNext(location('/dev/logs', '?states=failed&period=24h', '#top'))).toBe(
            '/signin?next=%2Fdev%2Flogs%3Fstates%3Dfailed%26period%3D24h%23top'
        );
    });

    it('omits next for the root path, which carries no destination', () => {
        expect(signinPathWithNext(location('/'))).toBe('/signin');
    });

    it('omits next past the length the server accepts', () => {
        const search = `?filters=${'a'.repeat(MAX_NEXT_LENGTH)}`;
        expect(signinPathWithNext(location('/dev/logs', search))).toBe('/signin');
        expect(signinPathWithNext(location('/dev/logs', `?filters=${'a'.repeat(MAX_NEXT_LENGTH - '/dev/logs?filters='.length)}`))).toContain('next=');
    });
});
