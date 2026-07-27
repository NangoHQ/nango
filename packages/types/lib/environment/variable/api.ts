import type { ApiEndpoint } from '../../api.js';
import type { DBEnvironmentVariable } from '../db.js';

export type ApiEnvironmentVariable = Pick<DBEnvironmentVariable, 'name' | 'value'>;
export type PostEnvironmentVariables = ApiEndpoint<{
    Audit: { reason: 'TODO: audit coverage pending' };
    Method: 'POST';
    Path: '/api/v1/environments/variables';
    Querystring: { env: string };
    Body: { variables: { name: string; value: string }[] };
    Success: {
        success: boolean;
    };
}>;
