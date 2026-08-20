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

        interface Request {
            // Set by finalizeManagedAuthentication so the audit finish-hook can tell a first SSO signup
            // (new user created) from a returning login on the same managed-auth routes.
            auditManagedSignup?: boolean;
            // Set the instant req.login establishes a session this request, so the audit finish-hook
            // records a sessionOutcome login only for an attempt that actually authenticated — not for a
            // pre-existing session on a failed attempt.
            auditAuthSucceeded?: boolean;
            // Set by every path that upserts a connection, so the route-level audit can tell a creation from
            // a re-authorization — a distinction only the upsert result carries, and one the response body
            // does not expose.
            // The account and environment travel with it because an unauthenticated route - an OAuth
            // callback - only learns them when the handler resolves the session, which is after the audit
            // middleware has had to decide anything it decides up front.
            auditConnectionUpsert?: {
                operation: import('@nangohq/types').AuthOperationType;
                connectionId: string;
                providerConfigKey: string;
                account: { id: number; uuid: string };
                environment: { id: number; name: string };
                // Same reason: on a callback the end user comes off the connect session the handler looked
                // up, so nothing on the request identifies them.
                endUser?: import('@nangohq/types').InternalEndUser | null | undefined;
            };
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
