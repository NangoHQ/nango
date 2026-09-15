declare global {
    namespace Express {
        /**
         * You should avoid using this type (req.user)
         * It's serialized in session, which means we can't easily add / remove fields
         */
        /**
         * Facts only a handler can know, for the audit middleware to act on at finish: whether a managed
         * callback created the user or logged one back in, whether this request established a session, and
         * what a connection upsert did. One namespace rather than an attribute per scenario.
         *
         * On the request rather than `res.locals` for two reasons: the connection controllers shadow `res`
         * with the upsert response, so the response is not reachable where the fact is known; and two
         * creation routes type it as `Response<any, any>`, which would leave those writes unchecked.
         */
        interface AuditFacts {
            managedSignup?: boolean;
            authSucceeded?: boolean;
            authPendingMfa?: { userId: number };
            connectionUpsert?: {
                operation: import('@nangohq/types').AuthOperationType;
                connectionId: string;
                providerConfigKey: string;
                account: { id: number; uuid: string };
                environment: { uuid: string; name: string };
                endUser?: import('@nangohq/types').InternalEndUser | null | undefined;
                authType?: 'publicKey' | 'connectSession' | undefined;
            };
        }

        interface Request {
            audit?: AuditFacts;
        }

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
