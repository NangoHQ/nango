import type { Endpoint } from '../../api';
import type { DBEnvironmentVariable } from '../db';

export type ApiEnvironmentVariable = Pick<DBEnvironmentVariable, 'name' | 'value'>;
export type PostEnvironmentVariables = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/environments/variables';
    Body: { variables: { name: string; value: string }[] };
    Success: {
        success: boolean;
    };
}>;
