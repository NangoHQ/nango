import type { Endpoint } from '../../api';
import type { DBEnvironment } from '../db';

export type PostEnvironment = Endpoint<{
    Method: 'POST';
    Path: '/api/v1/environments';
    Body: { name: string };
    Success: {
        data: Pick<DBEnvironment, 'id' | 'name'>;
    };
}>;
