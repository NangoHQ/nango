import { describe, expect, it } from 'vitest';

import { safeOAuthContinuation } from '../controllers/v1/account/returnTo.js';
import { oauthTelemetryPath } from './telemetry.js';
import { decisionBody, interactionParams } from './validation.js';

const opaque = 'a'.repeat(43);

describe('OAuth boundary schemas and telemetry', () => {
    it('accepts only opaque interaction identifiers and rejects browser-controlled identities and destinations', () => {
        expect(interactionParams.safeParse({ uid: opaque }).success).toBe(true);
        for (const extra of [{ userId: 1 }, { accountId: 1 }, { returnTo: 'https://evil.example' }, { issuer: 'https://evil.example' }]) {
            expect(interactionParams.safeParse({ uid: opaque, ...extra }).success).toBe(false);
            expect(decisionBody.safeParse({ csrfToken: opaque, ...extra }).success).toBe(false);
        }
        for (const state of ['', 'short', '../path', 'a'.repeat(129), `${opaque}?code=secret`]) {
            expect(interactionParams.safeParse({ uid: state }).success).toBe(false);
        }
    });

    it('retains only the exact server-side OAuth continuation through authentication', () => {
        expect(safeOAuthContinuation(`/oauth/continue/${opaque}`)).toBe(`/oauth/continue/${opaque}`);
        for (const value of [
            undefined,
            '/',
            '//evil.example',
            `https://app.nango.dev/oauth/continue/${opaque}`,
            `/oauth/continue/${opaque}?next=https://evil.example`,
            `/oauth/continue/${opaque}#fragment`,
            `/oauth/continue?state=${opaque}`
        ]) {
            expect(safeOAuthContinuation(value)).toBeUndefined();
        }
    });

    it('never uses authorization URLs, codes, or interaction IDs as telemetry labels', () => {
        expect(oauthTelemetryPath('/oauth/authorize?client_id=secret&code_challenge=secret')).toBe('/oauth/authorize');
        expect(oauthTelemetryPath(`/oauth/interaction/${opaque}/approve?code=secret`)).toBe('/oauth/interaction/:uid/approve');
        expect(oauthTelemetryPath(`/oauth/continue/${opaque}`)).toBe('/oauth/continue/:uid');
        expect(oauthTelemetryPath('/oauth/callback')).toBeUndefined();
    });
});
