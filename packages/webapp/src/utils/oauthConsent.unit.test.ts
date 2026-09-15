import { describe, expect, it } from 'vitest';

import { getOAuthConsentDestination } from './oauthConsent';

describe('getOAuthConsentDestination', () => {
    it('allows only a local OAuth consent route', () => {
        expect(getOAuthConsentDestination('/oauth/consent/interaction-id/review')).toBe('/oauth/consent/interaction-id/review');
        expect(getOAuthConsentDestination('/oauth/consent/interaction-id')).toBeUndefined();
        expect(getOAuthConsentDestination('/environments')).toBeUndefined();
        expect(getOAuthConsentDestination('//attacker.example/oauth/consent/id/review')).toBeUndefined();
        expect(getOAuthConsentDestination('https://attacker.example/oauth/consent/id/review')).toBeUndefined();
        expect(getOAuthConsentDestination('/oauth/consent/id/review?next=https://attacker.example')).toBeUndefined();
    });
});
