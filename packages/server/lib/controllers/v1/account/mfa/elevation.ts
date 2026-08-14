import type { Request } from 'express';

/**
 * Tracks that this session presented a second factor, so a sensitive action can rely on the earlier
 * verification instead of asking for another code. The factor itself stays single use.
 *
 * Must be called after req.login, which regenerates the session and would drop the marker.
 */
export function markMfaVerified(req: Request): void {
    req.session.mfaVerifiedAt = Date.now();
}

export function hasRecentMfa(req: Request, maxAgeMs: number): boolean {
    const verifiedAt = req.session.mfaVerifiedAt;
    return verifiedAt !== undefined && Date.now() - verifiedAt < maxAgeMs;
}
