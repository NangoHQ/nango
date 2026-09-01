declare global {
    namespace Express {
        /**
         * You should avoid using this type (req.user)
         * It's serialized in session, which means we can't easily add / remove fields
         */
        interface User {
            id: number;
            email: string;
            name: string;
            account_id: number;
        }
    }
}

declare module 'express-session' {
    interface SessionData {
        debugMode?: boolean;
        // The account that impersonated, not the person: gated on NANGO_ADMIN_UUID today, but the trail
        // records whoever it was rather than a hardcoded identity.
        impersonatedBy?: { accountId: number; accountName: string; actorId: number };
        managedAuthEmailVerification?: {
            email: string;
            emailVerificationId: string;
            pendingAuthenticationToken: string;
            state?: string | undefined;
        };
        pendingMfaLogin?: {
            userId: number;
            returnTo: string;
            createdAt: number;
        };
        mfaVerifiedAt?: number;
        pendingAccountDiscovery?: {
            userId: number;
            expiresAt: number;
            recommendation?: {
                accountId: number;
                accountName: string;
            };
        };
    }
}

// https://stackoverflow.com/questions/65805015/extending-session-object-in-express-session
// required to re-export the types
export {};
