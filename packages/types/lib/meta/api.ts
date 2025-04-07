import type { ApiError, Endpoint } from '../api';
import type { DBEnvironment } from '../environment/db';
import type { ApiPlan } from '../plans/http.api';

export type GetMeta = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/meta';
    Querystring: { env: string };
    Error: ApiError<'user_not_found'>;
    Success: {
        data: {
            plan: ApiPlan | null;
            environments: Pick<DBEnvironment, 'name'>[];
            version: string;
            baseUrl: string;
            debugMode: boolean;
            onboardingComplete: boolean;
        };
    };
}>;
