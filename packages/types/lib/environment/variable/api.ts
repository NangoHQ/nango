import type { ApiEndpoint } from '../../api.js';
import type { AuditPolicy } from '../../audit-trail/event.js';
import type { DBEnvironmentVariable } from '../db.js';

export type ApiEnvironmentVariable = Pick<DBEnvironmentVariable, 'name' | 'value'>;
export type PostEnvironmentVariables = ApiEndpoint<{
    Audit: AuditPolicy<'environment', 'variables_changed', 'environment'>;
    Method: 'POST';
    Path: '/api/v1/environments/variables';
    Querystring: { env: string };
    Body: { variables: { name: string; value: string }[] };
    Success: {
        success: boolean;
    };
}>;
