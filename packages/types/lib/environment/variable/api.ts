import type { ApiEndpoint } from '../../api.js';
import type { auditPolicies } from '../../audit-trail/event.js';
import type { DBEnvironmentVariable } from '../db.js';

export type ApiEnvironmentVariable = Pick<DBEnvironmentVariable, 'name' | 'value'>;
export type PostEnvironmentVariables = ApiEndpoint<{
    Audit: typeof auditPolicies.environmentVariablesChanged;
    Method: 'POST';
    Path: '/api/v1/environments/variables';
    Querystring: { env: string };
    Body: { variables: { name: string; value: string }[] };
    Success: {
        success: boolean;
    };
}>;
