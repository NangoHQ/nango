import type { Endpoint } from '../api';

export type GetAsyncActionResult = Endpoint<{
    Method: 'GET';
    Path: `/action/:id`;
    Params: {
        id: string;
    };
    Success: Record<string, any>;
}>;
