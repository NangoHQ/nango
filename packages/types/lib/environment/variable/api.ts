import type { Endpoint } from '../../api.js';
import type { DBEnvironmentVariable } from '../db.js';

export type ApiEnvironmentVariable = Pick<DBEnvironmentVariable, 'name' | 'value'>;
export type PostEnvironmentVariables = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/environments/variables';
    Body: { variables: { name: string; value: string }[] };
    Success: {
        success: boolean;
    };
}>;
