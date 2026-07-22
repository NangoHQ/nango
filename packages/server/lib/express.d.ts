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
