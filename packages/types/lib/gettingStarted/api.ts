import type { GettingStartedOutput, PatchGettingStartedInput } from './dto.js';
import type { ApiError, Endpoint } from '../api.js';

export type GetGettingStarted = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/getting-started';
    Success: {
        data: GettingStartedOutput;
    };
    Error: ApiError<'failed_to_get_or_create_getting_started_progress'>;
}>;

export type PatchGettingStarted = Endpoint<{
    Method: 'PATCH';
    Path: '/api/v1/getting-started';
    Success: {
        data: GettingStartedOutput;
    };
    Body: PatchGettingStartedInput;
}>;
