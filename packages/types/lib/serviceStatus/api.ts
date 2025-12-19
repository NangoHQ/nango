import type { Endpoint } from '../api.js';

export type GetServiceStatus = Endpoint<{
    Method: 'GET';
    Path: '/api/v1/service-status/:service';
    Params: { service: string };
    Success: {
        data: ServiceStatusResponse;
    };
}>;

export interface ServiceStatusResponse {
    status: 'operational' | 'degraded_performance' | 'major_outage' | 'unknown';
}
