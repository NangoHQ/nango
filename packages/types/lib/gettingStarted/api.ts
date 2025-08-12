import type { GettingStartedOutput, PatchGettingStartedInput } from './dto.js';
import type { ApiError, Endpoint } from '../api.js';

export type GetGettingStarted = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/getting-started';
    Querystring: { env: string };
    Success: {
        data: GettingStartedOutput;
    };
    Error: ApiError<'failed_to_get_or_create_getting_started_progress'>;
}>;

export type PatchGettingStarted = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/getting-started';
    Querystring: { env: string };
    Success: never;
    Body: PatchGettingStartedInput;
    Error: ApiError<'connection_not_found' | 'getting_started_progress_not_found' | 'failed_to_update_getting_started_progress'>;
}>;
