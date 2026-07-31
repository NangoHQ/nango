import type { ApiEndpoint, ApiError } from '../api.js';
import type { GettingStartedOutput as GettingStartedProgressOutput, PatchGettingStartedInput as PatchGettingStartedProgressInput } from './dto.js';

export type GetGettingStarted = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/getting-started';
    Querystring: { env: string };
    Success: {
        data: GettingStartedProgressOutput;
    };
    Error: ApiError<'failed_to_get_or_create_getting_started_progress'>;
}>;

export type PatchGettingStarted = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'PATCH';
    Path: '/api/v1/getting-started';
    Querystring: { env: string };
    Success: never;
    Body: PatchGettingStartedProgressInput;
    Error: ApiError<'connection_not_found' | 'getting_started_progress_not_found' | 'failed_to_update_getting_started_progress'>;
}>;
