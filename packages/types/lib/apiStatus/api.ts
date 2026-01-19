import type { Endpoint } from '../api.js';

export type GetApiStatus = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/api-status/:service';
    Params: { service: string };
    Success: {
        data: ApiStatusResponse;
    };
}>;

export type ApiStatus = 'operational' | 'degraded_performance' | 'major_outage' | 'unknown';

export interface ApiStatusResponse {
    status: ApiStatus;
}
