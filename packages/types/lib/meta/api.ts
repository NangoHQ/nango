import type { ApiEndpoint, ApiError } from '../api.js';
import type { DBEnvironment } from '../environment/db.js';

export type ApiEnvironmentSummary = Pick<DBEnvironment, 'id' | 'account_id' | 'name' | 'is_production'>;

export type GetMeta = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/meta';
    Querystring: { env: string };
    Error: ApiError<'user_not_found'>;
    Success: {
        data: {
            environments: ApiEnvironmentSummary[];
            version: string;
            baseUrl: string;
            debugMode: boolean;
            gettingStartedClosed: boolean;
            // Whether the audit trail is enabled for this account (per-account rollout flag); gates the dashboard UI.
            auditTrail: boolean;
            s26Pricing: boolean;
        };
    };
}>;
