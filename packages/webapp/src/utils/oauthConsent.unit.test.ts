import { describe, expect, it } from 'vitest';

import { getOAuthConsentDestination } from './oauthConsent';

describe('getOAuthConsentDestination', () => {
    it('allows only a local OAuth consent route', () => {
        expect(getOAuthConsentDestination('/oauth/consent/interaction-id')).toBe('/oauth/consent/interaction-id');
        expect(getOAuthConsentDestination('/environments')).toBeUndefined();
        expect(getOAuthConsentDestination('//attacker.example/oauth/consent/id')).toBeUndefined();
        expect(getOAuthConsentDestination('https://attacker.example/oauth/consent/id')).toBeUndefined();
        expect(getOAuthConsentDestination('/oauth/consent/id?next=https://attacker.example')).toBeUndefined();
    });
});
