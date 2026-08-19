import { afterEach, describe, expect, it, vi } from 'vitest';

import { hasRecentMfa, markMfaVerified } from './elevation.js';

import type { Request } from 'express';

const MAX_AGE_MS = 5 * 60 * 1000;

function reqWithSession(session: Record<string, unknown> = {}): Request {
    return { session } as unknown as Request;
}

describe('MFA elevation', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('treats a session that never verified as not elevated', () => {
        expect(hasRecentMfa(reqWithSession(), MAX_AGE_MS)).toBe(false);
    });

    it('elevates a session that just verified', () => {
        const req = reqWithSession();
        markMfaVerified(req);
        expect(hasRecentMfa(req, MAX_AGE_MS)).toBe(true);
    });

    it('stops elevating once the marker is older than the max age', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));

        const req = reqWithSession();
        markMfaVerified(req);

        vi.setSystemTime(new Date('2026-08-14T12:04:59Z'));
        expect(hasRecentMfa(req, MAX_AGE_MS)).toBe(true);

        vi.setSystemTime(new Date('2026-08-14T12:05:00Z'));
        expect(hasRecentMfa(req, MAX_AGE_MS)).toBe(false);
    });

    it('refuses a marker dated in the future', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-14T12:00:00Z'));

        expect(hasRecentMfa(reqWithSession({ mfaVerifiedAt: Date.now() + 60 * 60 * 1000 }), MAX_AGE_MS)).toBe(false);
    });
});
