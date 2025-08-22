import type { ApiError, Endpoint } from '../api.js';
import type { DBEnvironment } from '../environment/db.js';

export type GetMeta = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/meta';
    Querystring: { env: string };
    Error: ApiError<'user_not_found'>;
    Success: {
        data: {
            environments: Pick<DBEnvironment, 'name'>[];
            version: string;
            baseUrl: string;
            debugMode: boolean;
            gettingStartedClosed: boolean;
        };
    };
}>;
