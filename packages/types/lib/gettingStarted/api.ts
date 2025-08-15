import type { GettingStartedOutput as GettingStartedProgressOutput, PatchGettingStartedInput as PatchGettingStartedProgressInput } from './dto.js';
import type { ApiError, Endpoint } from '../api.js';

export type GetGettingStarted = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/getting-started';
    Querystring: { env: string };
    Success: {
        data: GettingStartedProgressOutput;
    };
    Error: ApiError<'failed_to_get_or_create_getting_started_progress'>;
}>;

export type PatchGettingStarted = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/getting-started';
    Querystring: { env: string };
    Success: never;
    Body: PatchGettingStartedProgressInput;
    Error: ApiError<'connection_not_found' | 'getting_started_progress_not_found' | 'failed_to_update_getting_started_progress'>;
}>;
