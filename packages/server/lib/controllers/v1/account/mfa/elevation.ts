import type { Request } from 'express';

/**
 * Tracks that this session presented a second factor, so a sensitive action can rely on the earlier
 * verification instead of asking for another code. The factor itself stays single use.
 *
 * req.login regenerates the session, so a marker set before it is dropped rather than carried over.
 */
export function markMfaVerified(req: Request): void {
    req.session.mfaVerifiedAt = Date.now();
}

export function hasRecentMfa(req: Request, maxAgeMs: number): boolean {
    const verifiedAt = req.session.mfaVerifiedAt;
    if (verifiedAt === undefined) {
        return false;
    }

    const age = Date.now() - verifiedAt;
    return age >= 0 && age < maxAgeMs;
}
